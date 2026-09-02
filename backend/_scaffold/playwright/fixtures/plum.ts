/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Wires up Plum's session recording — removing or reordering code here can silently break report replay.

import { test as base, BrowserContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Must match the mime types Plum's server expects — do not change.
const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
// Always attached, even for a test with no recorded events, so the worker that
// ran it is still recoverable for grouping.
const WORKER_META_MIME_TYPE = 'application/x-plum-worker+json';
// @rrweb/record's package.json only exports its main entry ("."), so a deep
// require.resolve() of the UMD bundle is blocked by Node's exports map — resolve
// the (exported) main entry instead and locate the sibling file on disk.
const RECORD_BUNDLE_PATH = path.join(
	path.dirname(require.resolve('@rrweb/record')),
	'record.umd.min.cjs'
);

const LIVE_FLUSH_INTERVAL_MS = 500;

interface TabRecording {
	tabId: string;
	tabIndex: number;
	events: unknown[];
	openedAt: number;
	closedAt: number | null;
	liveFlushedCount: number;
}

const tabIdForIndex = (index: number): string => (index === 0 ? 'main' : `tab-${index + 1}`);

/** The `step` fixture's type, for helpers that take it at describe scope. */
export type Step = (name: string, body: () => Promise<void> | void) => Promise<void>;

/**
 * Records every page in the test's context with rrweb and attaches the result,
 * so a Playwright run produces the same replay a Cucumber one does.
 *
 * This overrides Playwright's own `context` fixture rather than launching a
 * browser: Playwright owns that lifecycle, and hooking the context means popups
 * and target=_blank tabs are covered without racing their first navigation.
 */
export const test = base.extend<{
	context: BrowserContext;
	step: Step;
}>({
	/**
	 * Use this instead of test.step() to get a labelled replay.
	 *
	 * It reports the step exactly as test.step() does, and additionally drops a
	 * marker into the recording so the replay timeline can show which step was
	 * running. Cucumber does the marking automatically from a BeforeStep hook;
	 * Playwright has no equivalent, so it happens here.
	 */
	step: async ({ page }, use) => {
		await use(async (name, body) => {
			await markStep(page, name);
			await base.step(name, async () => {
				await body();
			});
		});
	},

	context: async ({ context }, use, testInfo) => {
		const tabs = new Map<Page, TabRecording>();
		let tabCounter = 0;
		let liveCounter = 0;
		let liveTimer: ReturnType<typeof setInterval> | null = null;
		// Playwright runs one worker per OS process and numbers them from 0; report
		// and display 1-based, like the rest of the worker-count UI.
		const workerId = testInfo.workerIndex + 1;

		const trackPage = (pg: Page) => {
			const tabIndex = tabCounter++;
			const recording: TabRecording = {
				tabId: tabIdForIndex(tabIndex),
				tabIndex,
				events: [],
				openedAt: Date.now(),
				closedAt: null,
				liveFlushedCount: 0
			};
			tabs.set(pg, recording);
			// A static page can go a long time between rrweb events, or emit none at all
			// after its initial load, so its own timestamps are a poor proxy for how
			// long it stayed relevant. Real open/close times let the replay UI line
			// multiple tabs up on one timeline without guessing from event gaps.
			pg.on('close', () => {
				recording.closedAt = Date.now();
			});
		};

		// Sends only what is newly arrived since the last tick, per tab, so a live
		// viewer gets a steady trickle instead of the whole buffer growing unbounded.
		const flushLive = () => {
			const ssDir = process.env.PLUM_SS_DIR;
			if (!ssDir) return;
			for (const recording of tabs.values()) {
				const newEvents = recording.events.slice(recording.liveFlushedCount);
				if (newEvents.length === 0) continue;
				recording.liveFlushedCount = recording.events.length;
				try {
					// workerId is part of the name because every worker writes into the same
					// directory with its own counter — without it two workers can land on
					// the same millisecond and counter, and one silently overwrites the other.
					const seq = `${String(Date.now()).padStart(16, '0')}-w${workerId}-${String(++liveCounter).padStart(4, '0')}`;
					fs.writeFileSync(
						path.join(ssDir, `${seq}.rrweb.json`),
						JSON.stringify({
							workerId,
							tabId: recording.tabId,
							tabIndex: recording.tabIndex,
							events: newEvents
						})
					);
				} catch {
					// best-effort — live streaming shouldn't affect the recording itself
				}
			}
		};

		// Context-level exposeBinding/addInitScript apply to every page in the
		// context automatically, current and future.
		await context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson: string) => {
			const recording = source.page && tabs.get(source.page);
			if (!recording) return;
			try {
				recording.events.push(JSON.parse(eventJson as string));
			} catch {
				// malformed event — drop it, recording is best-effort
			}
		});
		await context.addInitScript({ path: RECORD_BUNDLE_PATH });
		await context.addInitScript(() => {
			// addInitScript runs in every frame, including hidden ad/tracking iframes.
			// Recordings are tracked per-Page, so an unguarded sub-frame session would
			// corrupt the tab's event stream with bogus 0x0 "about:blank" entries.
			// @ts-ignore
			if (window.self !== window.top) return;
			// @ts-ignore
			if (window.rrwebRecord) {
				// @ts-ignore
				window.rrwebRecord.record({
					emit: (event: unknown) => {
						// @ts-ignore — exposed by BrowserContext.exposeBinding above
						window.__plumEmitRRwebEvent(JSON.stringify(event));
					}
				});
			}
		});

		context.on('page', trackPage);
		for (const existing of context.pages()) trackPage(existing);

		// Only when someone is actually watching live — a scheduled run with no
		// viewer shouldn't pay for this.
		if (process.env.PLUM_SS_DIR) {
			liveTimer = setInterval(flushLive, LIVE_FLUSH_INTERVAL_MS);
		}

		await use(context);

		if (liveTimer) {
			clearInterval(liveTimer);
			liveTimer = null;
		}
		// One last live flush so the stream doesn't miss whatever happened between
		// the final tick and the end of the test.
		flushLive();

		try {
			await testInfo.attach('plum-worker', {
				body: Buffer.from(JSON.stringify({ workerId }), 'utf8'),
				contentType: WORKER_META_MIME_TYPE
			});
		} catch {
			// best-effort — a missing worker marker just falls back to workerId 1
		}

		const flushedAt = Date.now();
		for (const recording of tabs.values()) {
			if (recording.events.length === 0) continue;
			try {
				const payload = JSON.stringify({
					workerId,
					tabId: recording.tabId,
					tabIndex: recording.tabIndex,
					events: recording.events,
					openedAt: recording.openedAt,
					// A tab still open when the test ends (typically the main one) stayed
					// relevant through to the flush, not just its last DOM event.
					closedAt: recording.closedAt ?? flushedAt
				});
				await testInfo.attach('plum-rrweb', {
					body: zlib.gzipSync(Buffer.from(payload, 'utf8')),
					contentType: RRWEB_MIME_TYPE
				});
			} catch {
				// a failed recording flush shouldn't fail the test
			}
		}
	}
});

/**
 * Injects a labeled rrweb custom event at the current recording timestamp so the
 * replay UI can show which step was running at any point in the timeline. Used by
 * the `step` fixture above; call it directly only for a marker outside a step.
 */
export async function markStep(page: Page, name: string): Promise<void> {
	try {
		await page.evaluate((label) => {
			// @ts-ignore — rrwebRecord is injected by the record.umd.min.cjs bundle
			if (window.rrwebRecord?.record?.addCustomEvent) {
				// @ts-ignore
				window.rrwebRecord.record.addCustomEvent('step', { name: label });
			}
		}, name);
	} catch {
		// best-effort — a missing marker only costs a label in the replay timeline
	}
}

export { expect } from '@playwright/test';
