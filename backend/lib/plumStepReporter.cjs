/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Runs inside the project's Playwright process, added to --reporter by
// buildRunCommand. It exists because the JSON reporter is missing two things
// Plum needs: a step's start time (it reports only a duration), and any step
// that ran inside a hook (those are dropped from the JSON entirely). The
// reporter API has both, so `test.step` is all a spec has to use.
//
// Written beside the JSON report as <report>.steps.json and folded back in by
// foldStepTimings. Nothing here is required for a run to succeed: if this file
// writes nothing, the report falls back to the JSON's own steps.

const fs = require('fs');

const AUTHORED = 'test.step';

// A step nested inside another authored step is left out: the report shows one
// flat list per scenario, which is what the JSON's own steps give too.
function isTopLevelAuthored(step) {
	if (step.category !== AUTHORED) return false;
	for (let parent = step.parent; parent; parent = parent.parent) {
		if (parent.category === AUTHORED) return false;
	}
	return true;
}

class PlumStepReporter {
	constructor() {
		// test.id + retry: the same key the JSON report exposes as spec.id and
		// result.retry, so a retried test's steps stay with the attempt that ran them.
		this.byResult = new Map();
		this.pending = new WeakMap();
	}

	onStepBegin(test, result, step) {
		if (!isTopLevelAuthored(step)) return;
		const key = `${test.id}:${result.retry}`;
		let steps = this.byResult.get(key);
		if (!steps) {
			steps = [];
			this.byResult.set(key, steps);
		}
		const entry = { name: step.title, startedAt: step.startTime.getTime() };
		steps.push(entry);
		this.pending.set(step, entry);
	}

	onStepEnd(test, result, step) {
		const entry = this.pending.get(step);
		if (!entry) return;
		entry.duration = step.duration ?? 0;
		entry.status = step.error ? 'failed' : 'passed';
		if (step.error?.message) entry.error = step.error.message;
	}

	onEnd() {
		const target = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || process.env.PLUM_REPORT_FILE;
		if (!target || this.byResult.size === 0) return;
		try {
			fs.writeFileSync(`${target}.steps.json`, JSON.stringify(Object.fromEntries(this.byResult)));
		} catch {
			// A run must not fail over its own step timings.
		}
	}
}

module.exports = PlumStepReporter;
