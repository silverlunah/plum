/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Plum's session recording. Import `test` from here instead of @playwright/test
// and your runs get report replay and step-by-step results.
//
// `test` is the only import that changes. expect, Page and everything else come
// from @playwright/test as usual, and you never need to edit this file to use a
// new Playwright API.

import { test as base, BrowserContext, Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
const WORKER_META_MIME_TYPE = 'application/x-plum-worker+json';
const STEPS_MIME_TYPE = 'application/x-plum-steps+json';

// @rrweb/record only exports its main entry, so resolve that and take the sibling
// bundle off disk.
const RECORD_BUNDLE_PATH = path.join(
	path.dirname(require.resolve('@rrweb/record')),
	'record.umd.min.cjs'
);

const LIVE_FLUSH_INTERVAL_MS = 500;

export type Step = <T>(name: string, body: () => Promise<T> | T) => Promise<T>;

type RecordedStep = { name: string; status: 'passed' | 'failed'; duration: number; error?: string };

interface TabRecording {
	tabId: string;
	tabIndex: number;
	events: unknown[];
	openedAt: number;
	closedAt: number | null;
	liveFlushedCount: number;
}

const tabIdForIndex = (index: number): string => (index === 0 ? 'main' : `tab-${index + 1}`);

async function markStep(page: Page, name: string): Promise<void> {
	try {
		await page.evaluate((label) => {
			// @ts-ignore: injected by the rrweb bundle
			if (window.rrwebRecord?.record?.addCustomEvent) {
				// @ts-ignore
				window.rrwebRecord.record.addCustomEvent('step', { name: label });
			}
		}, name);
	} catch {
		// best-effort: a missing marker only costs a label on the replay timeline
	}
}

export const test = base.extend<{
	plumSteps: RecordedStep[];
	step: Step;
	context: BrowserContext;
}>({
	plumSteps: async ({}, use) => {
		await use([]);
	},

	/**
	 * Reports a step and marks it on the replay timeline. Use this in place of
	 * `test.step`.
	 *
	 * Playwright's JSON report drops steps that run inside a hook, so `step` keeps
	 * its own list: which is what lets a `beforeEach` show up in Plum alongside the
	 * steps in the test body.
	 */
	step: async ({ page, plumSteps }, use) => {
		const step = async <T>(name: string, body: () => Promise<T> | T): Promise<T> => {
			await markStep(page, name);
			const startedAt = Date.now();
			try {
				const value = await base.step(name, async () => await body());
				plumSteps.push({ name, status: 'passed', duration: Date.now() - startedAt });
				return value;
			} catch (e: unknown) {
				plumSteps.push({
					name,
					status: 'failed',
					duration: Date.now() - startedAt,
					error: e instanceof Error ? e.message : String(e)
				});
				throw e;
			}
		};
		await use(step);
	},

	// Overrides Playwright's own context fixture so every page in it is recorded,
	// including popups and target=_blank tabs.
	context: async ({ context, plumSteps }, use, testInfo) => {
		const tabs = new Map<Page, TabRecording>();
		let tabCounter = 0;
		let liveCounter = 0;
		let liveTimer: ReturnType<typeof setInterval> | null = null;
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
			pg.on('close', () => {
				recording.closedAt = Date.now();
			});
		};

		// Only what is new since the last tick, so a live viewer gets a trickle
		// rather than an ever-growing buffer.
		const flushLive = () => {
			const ssDir = process.env.PLUM_SS_DIR;
			if (!ssDir) return;
			for (const recording of tabs.values()) {
				const newEvents = recording.events.slice(recording.liveFlushedCount);
				if (newEvents.length === 0) continue;
				recording.liveFlushedCount = recording.events.length;
				try {
					// The worker id is in the name because every worker writes here.
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
					// best-effort: live streaming must not affect the recording
				}
			}
		};

		await context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson: string) => {
			const recording = source.page && tabs.get(source.page);
			if (!recording) return;
			try {
				recording.events.push(JSON.parse(eventJson as string));
			} catch {
				// malformed event: recording is best-effort
			}
		});
		await context.addInitScript({ path: RECORD_BUNDLE_PATH });
		await context.addInitScript(() => {
			// Init scripts run in every frame; recording only the top one keeps ad and
			// tracking iframes out of the tab's event stream.
			// @ts-ignore
			if (window.self !== window.top) return;
			// @ts-ignore
			if (window.rrwebRecord) {
				// @ts-ignore
				window.rrwebRecord.record({
					emit: (event: unknown) => {
						// @ts-ignore: exposed above
						window.__plumEmitRRwebEvent(JSON.stringify(event));
					}
				});
			}
		});

		context.on('page', trackPage);
		for (const existing of context.pages()) trackPage(existing);

		if (process.env.PLUM_SS_DIR) {
			liveTimer = setInterval(flushLive, LIVE_FLUSH_INTERVAL_MS);
		}

		await use(context);

		if (liveTimer) clearInterval(liveTimer);
		flushLive();
		await attachResults(testInfo, workerId, tabs, plumSteps);
	}
});

async function attachResults(
	testInfo: TestInfo,
	workerId: number,
	tabs: Map<Page, TabRecording>,
	plumSteps: RecordedStep[]
): Promise<void> {
	const attach = async (name: string, body: Buffer, contentType: string) => {
		try {
			await testInfo.attach(name, { body, contentType });
		} catch {
			// a failed attachment must not fail the test
		}
	};

	await attach(
		'plum-worker',
		Buffer.from(JSON.stringify({ workerId }), 'utf8'),
		WORKER_META_MIME_TYPE
	);

	if (plumSteps.length > 0) {
		await attach('plum-steps', Buffer.from(JSON.stringify(plumSteps), 'utf8'), STEPS_MIME_TYPE);
	}

	const flushedAt = Date.now();
	for (const recording of tabs.values()) {
		if (recording.events.length === 0) continue;
		const payload = JSON.stringify({
			workerId,
			tabId: recording.tabId,
			tabIndex: recording.tabIndex,
			events: recording.events,
			openedAt: recording.openedAt,
			// A tab still open at the end stayed relevant to the flush, not just to
			// its last DOM event.
			closedAt: recording.closedAt ?? flushedAt
		});
		await attach('plum-rrweb', zlib.gzipSync(Buffer.from(payload, 'utf8')), RRWEB_MIME_TYPE);
	}
}

export { expect } from '@playwright/test';
