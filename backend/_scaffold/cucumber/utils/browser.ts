/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Wires up Plum's session recording: removing or reordering code here can silently break report replay.

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

interface TabRecording {
	tabId: string;
	tabIndex: number;
	events: unknown[];
	openedAt: number;
	closedAt: number | null;
	liveFlushedCount: number;
}

let _browser: Browser;
let _context: BrowserContext;
let _page: Page;
let _liveRRwebCounter = 0;
let _liveRRwebTimer: ReturnType<typeof setInterval> | null = null;
let _tabs: Map<Page, TabRecording> = new Map();
let _tabCounter = 0;
let _workerId = 1;

export const page = (): Page => _page;
export const context = (): BrowserContext => _context;

function tabIdForIndex(index: number): string {
	return index === 0 ? 'main' : `tab-${index + 1}`;
}

// A static page (nothing left to interact with) can go a long time between
// rrweb events, or emit none at all after its initial load, its own event
// timestamps are a poor proxy for how long it stayed relevant. Real
// open/close times let the replay UI line multiple tabs up on one timeline
// without guessing from event gaps.
function attachRecorder(pg: Page): void {
	const tabIndex = _tabCounter++;
	const recording: TabRecording = {
		tabId: tabIdForIndex(tabIndex),
		tabIndex,
		events: [],
		openedAt: Date.now(),
		closedAt: null,
		liveFlushedCount: 0
	};
	_tabs.set(pg, recording);
	pg.on('close', () => {
		recording.closedAt = Date.now();
	});
}

export async function setup(): Promise<void> {
	const isHeadless = process.env.IS_HEADLESS?.toLowerCase() !== 'false';
	const browserName = (process.env.BROWSER || 'chromium').toLowerCase();
	const browserType =
		browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
	_browser = await browserType.launch({ headless: isHeadless });
	_context = await _browser.newContext();

	_tabs = new Map();
	_tabCounter = 0;
	// Cucumber forks one OS process per --parallel worker and injects this env
	// var into each, 0-indexed, so display/report as 1-based like the rest of
	// the worker-count UI.
	const parsedWorkerId = parseInt(process.env.CUCUMBER_WORKER_ID ?? '', 10);
	_workerId = Number.isFinite(parsedWorkerId) ? parsedWorkerId + 1 : 1;

	// Context-level exposeBinding/addInitScript apply to every page in the
	// context automatically, current and future (popups, target=_blank tabs), so
	// recording setup never races a new tab's first navigation.
	await _context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson: string) => {
		const recording = source.page && _tabs.get(source.page);
		if (!recording) return;
		try {
			recording.events.push(JSON.parse(eventJson));
		} catch {
			// malformed event: drop it, recording is best-effort
		}
	});
	await _context.addInitScript({ path: RECORD_BUNDLE_PATH });
	await _context.addInitScript(() => {
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

	_context.on('page', attachRecorder);
	_page = await _context.newPage();

	// Only when someone's actually watching live: a scheduled/background run
	// with no viewer shouldn't pay for this.
	if (process.env.PLUM_SS_DIR) {
		_liveRRwebTimer = setInterval(flushLiveRRwebEvents, 500);
	}
}

// Sends only what's newly arrived since the last tick, per tab, so the live
// viewer gets a steady trickle instead of the full buffer growing unbounded.
function flushLiveRRwebEvents(): void {
	const ssDir = process.env.PLUM_SS_DIR;
	if (!ssDir) return;
	for (const recording of _tabs.values()) {
		const newEvents = recording.events.slice(recording.liveFlushedCount);
		if (newEvents.length === 0) continue;
		recording.liveFlushedCount = recording.events.length;
		try {
			// _workerId is part of the name because every worker writes into the same
			// directory with its own counter: without it two workers can land on the
			// same millisecond and counter, and one silently overwrites the other.
			const seq = `${String(Date.now()).padStart(16, '0')}-w${_workerId}-${String(++_liveRRwebCounter).padStart(4, '0')}`;
			fs.writeFileSync(
				path.join(ssDir, `${seq}.rrweb.json`),
				JSON.stringify({
					workerId: _workerId,
					tabId: recording.tabId,
					tabIndex: recording.tabIndex,
					events: newEvents
				})
			);
		} catch {
			// best-effort: live streaming shouldn't affect the recording itself
		}
	}
}

/**
 * Injects a labeled rrweb custom event at the current recording timestamp so
 * the replay UI can show which step was running at any point in the timeline.
 */
export async function markStepStart(stepName: string): Promise<void> {
	if (!_page) return;
	try {
		await _page.evaluate((name) => {
			// @ts-ignore: rrwebRecord is injected by the record.umd.min.cjs bundle
			if (window.rrwebRecord?.record?.addCustomEvent) {
				// @ts-ignore
				window.rrwebRecord.record.addCustomEvent('step', { name });
			}
		}, stepName);
	} catch {
		// best-effort: a missing marker just means the replay UI won't show a
		// step label at that point, it doesn't affect the recording itself
	}
}

/**
 * Flushes every tab's buffered rrweb events (one per opened tab/popup) as a
 * gzip-compressed Cucumber attachment, tagged with the mime type Plum's
 * server looks for.
 */
export async function flushRecordings(
	attach: (data: Buffer, mime: string) => Promise<void>
): Promise<void> {
	if (_liveRRwebTimer) {
		clearInterval(_liveRRwebTimer);
		_liveRRwebTimer = null;
	}
	// One last live flush so the stream doesn't miss whatever happened between
	// the final tick and scenario end.
	flushLiveRRwebEvents();

	try {
		await attach(
			Buffer.from(JSON.stringify({ workerId: _workerId }), 'utf8'),
			WORKER_META_MIME_TYPE
		);
	} catch {
		// best-effort: a missing worker marker just falls back to workerId 1
	}

	const flushedAt = Date.now();
	for (const recording of _tabs.values()) {
		if (recording.events.length === 0) continue;
		try {
			const payload = JSON.stringify({
				workerId: _workerId,
				tabId: recording.tabId,
				tabIndex: recording.tabIndex,
				events: recording.events,
				openedAt: recording.openedAt,
				// A tab still open when the scenario ends (typically the main tab)
				// stayed relevant through to the flush, not just its last DOM event.
				closedAt: recording.closedAt ?? flushedAt
			});
			const gz = zlib.gzipSync(Buffer.from(payload, 'utf8'));
			await attach(gz, RRWEB_MIME_TYPE);
		} catch {
			// a failed recording flush shouldn't fail the scenario
		}
	}
}

export async function teardown(): Promise<void> {
	await _browser?.close();
}

// ---------------------------------------------------------------------------
// Your code below this line. Everything above wires up Plum's session
// recording: leave it as-is. Add your own page/context helpers here, built
// on the exported page()/context() above (e.g. a helper for a second tab or
// a second browser context).
// ---------------------------------------------------------------------------
