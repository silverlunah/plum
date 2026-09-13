/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Plum's session recording, and the browser the hooks in hooks.ts open per
// scenario. This file is Plum's: leave it alone.

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Must match the mime type Plum's server expects, do not change.
const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
// Always attached, even for a scenario with no recorded events, so the
// worker that ran it is still recoverable for grouping.
const WORKER_META_MIME_TYPE = 'application/x-plum-worker+json';
// @rrweb/record's package.json only exports its main entry ("."), so a deep
// require.resolve() of the UMD bundle is blocked by Node's exports map, resolve
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

// Cucumber's attach is an intersection of overloads whose Buffer form returns
// void, so requiring Promise<void> here matched none of them.
type Attach = (data: Buffer, mime: string) => void | Promise<void>;

const tabIdForIndex = (index: number): string => (index === 0 ? 'main' : `tab-${index + 1}`);

export class SessionRecorder {
	private readonly tabs = new Map<Page, TabRecording>();
	private tabCounter = 0;
	private liveCounter = 0;
	private liveTimer: ReturnType<typeof setInterval> | null = null;
	private readonly workerId: number;

	constructor(private readonly context: BrowserContext) {
		// Cucumber forks one OS process per --parallel worker and injects this env
		// var into each, 0-indexed, so display/report as 1-based like the rest of
		// the worker-count UI.
		const parsed = parseInt(process.env.CUCUMBER_WORKER_ID ?? '', 10);
		this.workerId = Number.isFinite(parsed) ? parsed + 1 : 1;
	}

	// Context-level exposeBinding/addInitScript apply to every page in the
	// context automatically, current and future (popups, target=_blank tabs), so
	// recording setup never races a new tab's first navigation.
	async start(): Promise<void> {
		await this.context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson: string) => {
			const recording = source.page && this.tabs.get(source.page);
			if (!recording) return;
			try {
				recording.events.push(JSON.parse(eventJson));
			} catch {
				// malformed event: drop it, recording is best-effort
			}
		});
		await this.context.addInitScript({ path: RECORD_BUNDLE_PATH });
		await this.context.addInitScript(() => {
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
						// @ts-ignore: exposed by BrowserContext.exposeBinding above
						window.__plumEmitRRwebEvent(JSON.stringify(event));
					}
				});
			}
		});

		this.context.on('page', (pg) => this.track(pg));
		for (const existing of this.context.pages()) this.track(existing);

		// Only when someone is actually watching live: a scheduled run with no
		// viewer should not pay for this.
		if (process.env.PLUM_SS_DIR) {
			this.liveTimer = setInterval(() => this.flushLive(), LIVE_FLUSH_INTERVAL_MS);
		}
	}

	/**
	 * Injects a labeled rrweb custom event at the current recording timestamp so
	 * the replay can show which step was running at any point in the timeline.
	 */
	async markStep(page: Page, stepName: string): Promise<void> {
		try {
			await page.evaluate((name) => {
				// @ts-ignore: rrwebRecord is injected by the record.umd.min.cjs bundle
				if (window.rrwebRecord?.record?.addCustomEvent) {
					// @ts-ignore
					window.rrwebRecord.record.addCustomEvent('step', { name });
				}
			}, stepName);
		} catch {
			// best-effort: a missing marker just means the replay will not show a
			// step label at that point, it does not affect the recording itself
		}
	}

	/**
	 * Flushes every tab's buffered rrweb events (one per opened tab/popup) as a
	 * gzip-compressed Cucumber attachment, tagged with the mime type Plum's
	 * server looks for.
	 */
	async flush(attach: Attach): Promise<void> {
		if (this.liveTimer) {
			clearInterval(this.liveTimer);
			this.liveTimer = null;
		}
		// One last live flush so the stream does not miss whatever happened between
		// the final tick and scenario end.
		this.flushLive();

		try {
			await attach(
				Buffer.from(JSON.stringify({ workerId: this.workerId }), 'utf8'),
				WORKER_META_MIME_TYPE
			);
		} catch {
			// best-effort: a missing worker marker just falls back to workerId 1
		}

		const flushedAt = Date.now();
		for (const recording of this.tabs.values()) {
			if (recording.events.length === 0) continue;
			try {
				const payload = JSON.stringify({
					workerId: this.workerId,
					tabId: recording.tabId,
					tabIndex: recording.tabIndex,
					events: recording.events,
					openedAt: recording.openedAt,
					// A tab still open when the scenario ends (typically the main tab)
					// stayed relevant through to the flush, not just its last DOM event.
					closedAt: recording.closedAt ?? flushedAt
				});
				await attach(zlib.gzipSync(Buffer.from(payload, 'utf8')), RRWEB_MIME_TYPE);
			} catch {
				// a failed recording flush should not fail the scenario
			}
		}
	}

	// A static page can go a long time between rrweb events, or emit none at all
	// after its initial load, so its own event timestamps are a poor proxy for
	// how long it stayed relevant. Real open/close times let the replay line
	// multiple tabs up on one timeline without guessing from event gaps.
	private track(pg: Page): void {
		if (this.tabs.has(pg)) return;
		const tabIndex = this.tabCounter++;
		const recording: TabRecording = {
			tabId: tabIdForIndex(tabIndex),
			tabIndex,
			events: [],
			openedAt: Date.now(),
			closedAt: null,
			liveFlushedCount: 0
		};
		this.tabs.set(pg, recording);
		pg.on('close', () => {
			recording.closedAt = Date.now();
		});
	}

	// Only what is new since the last tick, per tab, so a live viewer gets a
	// steady trickle instead of an ever-growing buffer. The worker id is in the
	// name because every worker writes into this one directory: without it two
	// workers can land on the same millisecond and counter, and one silently
	// overwrites the other.
	private flushLive(): void {
		const ssDir = process.env.PLUM_SS_DIR;
		if (!ssDir) return;
		for (const recording of this.tabs.values()) {
			const newEvents = recording.events.slice(recording.liveFlushedCount);
			if (newEvents.length === 0) continue;
			recording.liveFlushedCount = recording.events.length;
			try {
				const seq = `${String(Date.now()).padStart(16, '0')}-w${this.workerId}-${String(++this.liveCounter).padStart(4, '0')}`;
				fs.writeFileSync(
					path.join(ssDir, `${seq}.rrweb.json`),
					JSON.stringify({
						workerId: this.workerId,
						tabId: recording.tabId,
						tabIndex: recording.tabIndex,
						events: newEvents
					})
				);
			} catch {
				// best-effort: live streaming should not affect the recording itself
			}
		}
	}
}

/**
 * A browser, a context and one page, with recording already attached. Called by
 * the Before hook. The recorder has to start before the first page is opened, or
 * that page loads without the recording script.
 */
export async function openRecordedBrowser(): Promise<{
	browser: Browser;
	context: BrowserContext;
	page: Page;
	recorder: SessionRecorder;
}> {
	const browserName = (process.env.BROWSER || 'chromium').toLowerCase();
	const browserType =
		browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;

	const browser = await browserType.launch({
		headless: process.env.IS_HEADLESS?.toLowerCase() !== 'false'
	});
	// baseURL lets page objects navigate with a relative path, e.g. page.goto('/').
	const context = await browser.newContext({ baseURL: process.env.BASE_URL });

	const recorder = new SessionRecorder(context);
	await recorder.start();

	const page = await context.newPage();
	return { browser, context, page, recorder };
}
