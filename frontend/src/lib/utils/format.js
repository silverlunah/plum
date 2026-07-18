/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { TRIGGER_TYPES } from '$lib/constants';

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

export function fmtDuration(ms) {
	if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
	return ms + 'ms';
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

export function scenarioHasScreenshots(scenario) {
	return scenario.steps?.some((step) => step.screenshot) ?? false;
}
