/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { TRIGGER_TYPES, BROWSERS } from '$lib/constants';

// Stored browser values are engine ids ('chromium', 'firefox'); show the brand
// name everywhere the user sees one.
export const browserLabel = (id) => BROWSERS.find((b) => b.id === id)?.label ?? id ?? '';

const NON_SCHEDULED = new Set([
	TRIGGER_TYPES.MANUAL,
	TRIGGER_TYPES.CLI,
	TRIGGER_TYPES.MCP,
	TRIGGER_TYPES.EXTERNAL,
	'undefined'
]);

export function isScheduled(type) {
	return !!type && !NON_SCHEDULED.has(type);
}

// Appends "(MCP)" to a person's name when the thing they made or ran came in
// over an MCP key, so its origin shows everywhere the name does.
export const mcpName = (name, viaMcp) => (viaMcp ? `${name} (MCP)` : name);

export function triggerLabel(type) {
	if (type === TRIGGER_TYPES.MANUAL) return 'Manual';
	if (type === TRIGGER_TYPES.CLI || type === 'undefined') return 'CLI';
	if (type === TRIGGER_TYPES.MCP) return 'MCP';
	if (type === TRIGGER_TYPES.EXTERNAL) return 'External';
	return 'Scheduled';
}

export function triggerVariant(type) {
	if (type === TRIGGER_TYPES.MANUAL) return 'tag';
	if (type === TRIGGER_TYPES.CLI || type === 'undefined') return 'neutral';
	if (type === TRIGGER_TYPES.MCP) return 'mcp';
	if (type === TRIGGER_TYPES.EXTERNAL) return 'external';
	return 'schedule';
}

/** Returns an inline style string for staggered fadeUp animations. */
export function stagger(i, stepMs = 45) {
	return `animation-delay: ${i * stepMs}ms`;
}

// "just now" / "5m ago" / "3h ago" / "2d ago", then an absolute date once it's a
// week old, for feeds where the exact second stops mattering.
export function relativeTime(iso) {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const diff = Date.now() - then;
	const min = 60_000;
	if (diff < min) return 'just now';
	if (diff < 60 * min) return `${Math.floor(diff / min)}m ago`;
	if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))}h ago`;
	if (diff < 7 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))}d ago`;
	return new Date(iso).toLocaleDateString();
}

export function fmtDuration(ms) {
	if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
	return ms + 'ms';
}

// Only for a report's overall duration; a single step/scenario still wants
// fmtDuration's sub-second precision, not h:m:s.
export function fmtTotalDuration(ms) {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n) => String(n).padStart(2, '0');
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * Trims a Cucumber feature URI to a readable suffix. Dispatched runs report an
 * absolute temp path on the node (…/plum-job-<uuid>/features/Login.feature); show
 * only the part from `features/` onward so the column stays short.
 */
export function featureFile(uri) {
	if (!uri) return '';
	const normalized = uri.replace(/\\/g, '/');
	const idx = normalized.lastIndexOf('/features/');
	if (idx !== -1) return normalized.slice(idx + 1);
	return normalized.split('/').pop();
}

export function keywordClass(kw) {
	const k = (kw ?? '').toLowerCase().replace(/:$/, '');
	if (k === 'given') return 'kw-given';
	if (k === 'when') return 'kw-when';
	if (k === 'then') return 'kw-then';
	return 'kw-and';
}

// Matches both verbose tags (@test-login-1, @suite-login) and the TC-/TS-
// displayId convention (@TC-001, @TS-001) used by default throughout the rest
// of the app (test case/suite prefixes, configurable in Settings).
function isSuiteTag(tag) {
	return /suite/i.test(tag) || /^@ts-?\d+/i.test(tag);
}

function isTestCaseTag(tag) {
	return /^@test[\w-]*/i.test(tag) || /^@tc-?\d+/i.test(tag);
}

export function scenarioTestTag(scenario) {
	return scenario.tags?.find(isTestCaseTag) ?? null;
}

export function featureSuiteTag(feature) {
	for (const scenario of feature.scenarios ?? []) {
		const suiteTag = scenario.tags?.find(isSuiteTag);
		if (suiteTag) return suiteTag;
	}
	return null;
}

export function visibleTags(scenario) {
	const testTag = scenarioTestTag(scenario);
	if (testTag) return [testTag];
	return (scenario.tags ?? []).filter((tag) => !isSuiteTag(tag));
}

const STATUS_RANK = { failed: 3, pending: 2, skipped: 1, passed: 0 };

export function worstStatus(scenarios) {
	return scenarios.reduce(
		(s, scenario) =>
			(STATUS_RANK[scenario.status] ?? 0) > (STATUS_RANK[s] ?? 0) ? scenario.status : s,
		'passed'
	);
}

export function groupedScenarios(scenarios) {
	const groups = new Map();
	for (const scenario of scenarios) {
		const testTag = scenarioTestTag(scenario);
		const key = testTag ?? `${scenario.keyword}:${scenario.name}`;
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				name: scenario.name,
				tags: visibleTags(scenario),
				scenarios: [],
				duration: 0,
				status: scenario.status
			});
		}
		const group = groups.get(key);
		group.scenarios.push(scenario);
		group.duration += scenario.duration ?? 0;
		group.status = worstStatus(group.scenarios);
	}
	return Array.from(groups.values());
}

export function parseRunnerLogs(logs) {
	if (!logs) return [];
	if (!/^=== .+ ===/m.test(logs)) return [{ name: 'Logs', content: logs }];
	const sections = [];
	for (const chunk of logs.split(/\n\n(?==== )/)) {
		const m = chunk.match(/^=== (.+?) ===\n?([\s\S]*)/);
		if (m) sections.push({ name: m[1].trim(), content: m[2].trim() });
	}
	return sections;
}

/**
 * Buckets a report's features/scenarios by runner (lane) then worker
 * (Cucumber --parallel process), preserving first-seen order. The innermost
 * `features` array keeps the same shape as the flat list it replaces,
 * callers should only show a group header when a level has more than one
 * bucket.
 */
export function groupScenariosByRunnerAndWorker(features) {
	const runnerOrder = [];
	const runnerMap = new Map();

	for (const feature of features ?? []) {
		for (const scenario of feature.scenarios ?? []) {
			const runnerKey = scenario.runnerName ?? '';
			const workerKey = scenario.workerId ?? 1;

			if (!runnerMap.has(runnerKey)) {
				runnerMap.set(runnerKey, {
					runnerName: scenario.runnerName ?? null,
					workerOrder: [],
					workerMap: new Map()
				});
				runnerOrder.push(runnerKey);
			}
			const runnerEntry = runnerMap.get(runnerKey);

			if (!runnerEntry.workerMap.has(workerKey)) {
				runnerEntry.workerMap.set(workerKey, {
					workerId: workerKey,
					featureOrder: [],
					featureMap: new Map()
				});
				runnerEntry.workerOrder.push(workerKey);
			}
			const workerEntry = runnerEntry.workerMap.get(workerKey);

			if (!workerEntry.featureMap.has(feature.name)) {
				workerEntry.featureMap.set(feature.name, { ...feature, scenarios: [] });
				workerEntry.featureOrder.push(feature.name);
			}
			workerEntry.featureMap.get(feature.name).scenarios.push(scenario);
		}
	}

	return runnerOrder.map((rk) => {
		const r = runnerMap.get(rk);
		return {
			runnerName: r.runnerName,
			workers: r.workerOrder.map((wk) => {
				const w = r.workerMap.get(wk);
				return {
					workerId: w.workerId,
					features: w.featureOrder.map((fn) => {
						const f = w.featureMap.get(fn);
						return { ...f, scenarioGroups: groupedScenarios(f.scenarios) };
					})
				};
			})
		};
	});
}

/**
 * Turns a scenario's tab recordings into an ordered, non-overlapping timeline
 * of {recordingId, from, to} segments (epoch ms), so a replay can auto-switch
 * which tab it's showing instead of a manual tab strip. Recordings missing
 * startedAt/endedAt (written before that field existed) are dropped, nothing
 * to line up on a shared clock without them.
 *
 * With `eventsById` (a recordingId -> rrweb event array Map or object), the
 * active tab at any instant is the one actually producing events. A tab that
 * only stayed open in the background does not own the timeline while another
 * tab is being driven — the Playwright fixture keeps its second tab open for
 * the whole test, so open/close spans there would hand the replay to a blank
 * or frozen tab for most of the run. Without the events (not fetched yet) tabs
 * fall back to opening/closing like a stack, the shape the Cucumber scaffold's
 * own tab tracking produces.
 */
export function computeRecordingSegments(recordings, eventsById = null) {
	const usable = recordings.filter((r) => r.startedAt != null && r.endedAt != null);
	if (usable.length < 2) return segmentsByOpenClose(usable);

	const getEvents = (id) =>
		typeof eventsById?.get === 'function' ? eventsById.get(id) : eventsById?.[id];

	const samples = [];
	for (const r of usable) {
		const events = getEvents(r.id);
		if (!events) return segmentsByOpenClose(usable);
		// type 5 is a custom event (step markers): metadata, not a frame on screen.
		for (const e of events) if (e.type !== 5) samples.push({ rec: r.id, ts: e.timestamp });
	}
	if (samples.length === 0) return segmentsByOpenClose(usable);
	samples.sort((a, b) => a.ts - b.ts);

	// A lone stray event from a backgrounded tab (an app timer firing, say)
	// must not steal the timeline: hand it over only when the other tab
	// out-produces the current one over the next SETTLE_MS. Re-checking that on
	// every event from a chatty background tab is wasteful, so rate-limit it.
	const SETTLE_MS = 600;
	const EVAL_EVERY_MS = 150;
	const raw = [];
	let active = samples[0].rec;
	let from = usable.reduce((min, r) => Math.min(min, r.startedAt), samples[0].ts);
	let nextEval = samples[0].ts;

	for (let i = 1; i < samples.length; i++) {
		const s = samples[i];
		if (s.rec === active || s.ts < nextEval) continue;
		nextEval = s.ts + EVAL_EVERY_MS;
		if (s.ts === from || !winsSettleWindow(samples, i, s.rec, active, SETTLE_MS)) continue;
		raw.push({ recordingId: active, from, to: s.ts });
		active = s.rec;
		from = s.ts;
	}
	raw.push({ recordingId: active, from, to: Math.max(from, lastSampleTs(samples, active)) });

	// A rejected switch can leave two consecutive segments on the same tab.
	const merged = [];
	for (const seg of raw) {
		const prev = merged[merged.length - 1];
		if (prev && prev.recordingId === seg.recordingId) prev.to = seg.to;
		else merged.push(seg);
	}
	return merged;
}

function winsSettleWindow(samples, start, candidate, incumbent, windowMs) {
	const deadline = samples[start].ts + windowMs;
	let cand = 0;
	let inc = 0;
	for (let i = start; i < samples.length && samples[i].ts <= deadline; i++) {
		if (samples[i].rec === candidate) cand++;
		else if (samples[i].rec === incumbent) inc++;
	}
	return cand > inc;
}

function lastSampleTs(samples, rec) {
	for (let i = samples.length - 1; i >= 0; i--) if (samples[i].rec === rec) return samples[i].ts;
	return samples[samples.length - 1]?.ts ?? 0;
}

function segmentsByOpenClose(usable) {
	if (usable.length === 0) return [];

	const boundaries = usable.flatMap((r) => [
		{ ts: r.startedAt, kind: 'open', recording: r },
		{ ts: r.endedAt, kind: 'close', recording: r }
	]);
	boundaries.sort((a, b) => a.ts - b.ts || (a.kind === 'open' ? -1 : 1));

	const segments = [];
	const stack = [];
	let lastBoundary = boundaries[0].ts;

	for (const b of boundaries) {
		if (b.kind === 'open') {
			const top = stack[stack.length - 1];
			if (top && b.ts > lastBoundary) {
				segments.push({ recordingId: top.id, from: lastBoundary, to: b.ts });
			}
			stack.push(b.recording);
			lastBoundary = b.ts;
		} else if (stack[stack.length - 1]?.id === b.recording.id) {
			segments.push({ recordingId: b.recording.id, from: lastBoundary, to: b.ts });
			stack.pop();
			lastBoundary = b.ts;
		}
		// A close for a recording that isn't currently on top means it opened
		// and closed while something nested inside it was still active, its
		// own segment stays open until whatever's on top of it closes too.
	}
	const remaining = stack[stack.length - 1];
	if (remaining && remaining.endedAt > lastBoundary) {
		segments.push({ recordingId: remaining.id, from: lastBoundary, to: remaining.endedAt });
	}
	return segments;
}
