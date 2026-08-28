/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// The actual implementation behind tests/utils/browser.ts and hooks.ts.
// Customer test projects only get a thin pass-through to this module (see
// backend/_scaffold/utils/) — keeping the real wiring here means every
// `npm install -g plum-e2e@latest` picks up fixes/changes immediately,
// without needing to re-sync anything into an existing customer project.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dotenv = require('dotenv');
const { chromium, firefox, webkit } = require('playwright');
const { Before, After, BeforeStep } = require('@cucumber/cucumber');

dotenv.config();

// Must match the mime type Plum's server expects — do not change.
const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
// Always attached, even for a scenario with no recorded events, so the
// worker that ran it is still recoverable for grouping.
const WORKER_META_MIME_TYPE = 'application/x-plum-worker+json';
// @rrweb/record's package.json only exports its main entry ("."), so a deep
// require.resolve() of the UMD bundle is blocked by Node's exports map — resolve
// the (exported) main entry instead and locate the sibling file on disk.
const RECORD_BUNDLE_PATH = path.join(
	path.dirname(require.resolve('@rrweb/record')),
	'record.umd.min.cjs'
);

let _browser;
let _context;
let _page;
let _liveRRwebCounter = 0;
let _liveRRwebTimer = null;
let _tabs = new Map();
let _tabCounter = 0;
let _workerId = 1;

const page = () => _page;
const context = () => _context;

function tabIdForIndex(index) {
	return index === 0 ? 'main' : `tab-${index + 1}`;
}

// A static page (nothing left to interact with) can go a long time between
// rrweb events, or emit none at all after its initial load — its own event
// timestamps are a poor proxy for how long it stayed relevant. Real
// open/close times let the replay UI line multiple tabs up on one timeline
// without guessing from event gaps.
function attachRecorder(pg) {
	const tabIndex = _tabCounter++;
	const recording = {
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

async function setup() {
	const isHeadless = process.env.IS_HEADLESS?.toLowerCase() !== 'false';
	const browserName = (process.env.BROWSER || 'chromium').toLowerCase();
	const browserType =
		browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
	_browser = await browserType.launch({ headless: isHeadless });
	_context = await _browser.newContext();

	_tabs = new Map();
	_tabCounter = 0;
	// Cucumber forks one OS process per --parallel worker and injects this env
	// var into each — 0-indexed, so display/report as 1-based like the rest of
	// the worker-count UI.
	const parsedWorkerId = parseInt(process.env.CUCUMBER_WORKER_ID ?? '', 10);
	_workerId = Number.isFinite(parsedWorkerId) ? parsedWorkerId + 1 : 1;

	// Context-level exposeBinding/addInitScript apply to every page in the
	// context automatically — current and future (popups, target=_blank tabs) —
	// so recording setup never races a new tab's first navigation.
	await _context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson) => {
		const recording = source.page && _tabs.get(source.page);
		if (!recording) return;
		try {
			recording.events.push(JSON.parse(eventJson));
		} catch {
			// malformed event — drop it, recording is best-effort
		}
	});
	await _context.addInitScript({ path: RECORD_BUNDLE_PATH });
	await _context.addInitScript(() => {
		// addInitScript runs in every frame, including hidden ad/tracking iframes.
		// Recordings are tracked per-Page, so an unguarded sub-frame session would
		// corrupt the tab's event stream with bogus 0x0 "about:blank" entries.
		if (window.self !== window.top) return;
		if (window.rrwebRecord) {
			window.rrwebRecord.record({
				emit: (event) => {
					// exposed by BrowserContext.exposeBinding above
					window.__plumEmitRRwebEvent(JSON.stringify(event));
				}
			});
		}
	});

	_context.on('page', attachRecorder);
	_page = await _context.newPage();

	// Only when someone's actually watching live — a scheduled/background run
	// with no viewer shouldn't pay for this.
	if (process.env.PLUM_SS_DIR) {
		_liveRRwebTimer = setInterval(flushLiveRRwebEvents, 500);
	}
}

// Sends only what's newly arrived since the last tick, per tab, so the live
// viewer gets a steady trickle instead of the full buffer growing unbounded.
function flushLiveRRwebEvents() {
	const ssDir = process.env.PLUM_SS_DIR;
	if (!ssDir) return;
	for (const recording of _tabs.values()) {
		const newEvents = recording.events.slice(recording.liveFlushedCount);
		if (newEvents.length === 0) continue;
		recording.liveFlushedCount = recording.events.length;
		try {
			const seq = `${String(Date.now()).padStart(16, '0')}-${String(++_liveRRwebCounter).padStart(4, '0')}`;
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
			// best-effort — live streaming shouldn't affect the recording itself
		}
	}
}

// Injects a labeled rrweb custom event at the current recording timestamp so
// the replay UI can show which step was running at any point in the timeline.
async function markStepStart(stepName) {
	if (!_page) return;
	try {
		await _page.evaluate((name) => {
			if (window.rrwebRecord?.record?.addCustomEvent) {
				window.rrwebRecord.record.addCustomEvent('step', { name });
			}
		}, stepName);
	} catch {
		// best-effort — a missing marker just means the replay UI won't show a
		// step label at that point, it doesn't affect the recording itself
	}
}

// Flushes every tab's buffered rrweb events (one per opened tab/popup) as a
// gzip-compressed Cucumber attachment, tagged with the mime type Plum's
// server looks for.
async function flushRecordings(attach) {
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
		// best-effort — a missing worker marker just falls back to workerId 1
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

async function teardown() {
	await _browser?.close();
}

// Pickle steps carry no keyword (Cucumber normalizes Given/When/Then/And/But
// away during Gherkin → Pickle compilation) — recover it by walking the
// gherkinDocument for the AST node the pickle step was compiled from.
function resolveStepKeyword(gherkinDocument, pickleStep) {
	const astNodeId = pickleStep?.astNodeIds?.[0];
	if (!astNodeId) return '';
	const steps = [];
	for (const child of gherkinDocument?.feature?.children ?? []) {
		if (child.background) steps.push(...child.background.steps);
		if (child.scenario) steps.push(...child.scenario.steps);
		for (const ruleChild of child.rule?.children ?? []) {
			if (ruleChild.background) steps.push(...ruleChild.background.steps);
			if (ruleChild.scenario) steps.push(...ruleChild.scenario.steps);
		}
	}
	return steps.find((s) => s.id === astNodeId)?.keyword?.trim() ?? '';
}

// Registers Plum's own Before/BeforeStep/After hooks. Call once from the
// project's own tests/utils/hooks.ts — Cucumber supports multiple Before/After
// hooks, so a customer's own hooks can still be added alongside this.
function registerHooks() {
	Before(async ({ pickle }) => {
		const tags = pickle.tags.map((t) => t.name).join(' ');
		console.log(`\n▶ ${pickle.name}${tags ? `  ${tags}` : ''}`);
		await setup();
	});

	BeforeStep(async function ({ pickleStep, gherkinDocument }) {
		const keyword = resolveStepKeyword(gherkinDocument, pickleStep);
		const text = pickleStep?.text ?? '';
		await markStepStart(keyword ? `${keyword} ${text}` : text);
	});

	After(async function () {
		await flushRecordings(this.attach.bind(this));
		await teardown();
	});
}

module.exports = {
	page,
	context,
	setup,
	teardown,
	flushRecordings,
	markStepStart,
	registerHooks
};
