/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// In-memory registry of every run currently in progress (manual, cron, REST/MCP-triggered),
// so a client connecting or reconnecting after a run already started — e.g. after a page
// refresh — can hydrate its "currently running" UI instead of only relying on the live
// socket events emitted at the moment a run began.
const activeRuns = new Map();

// Same staleness problem trigger.routes.js already solves for its own `jobs` Map
// (see JOB_TTL_MS/pruneOldJobs there) — a run whose completion callback never runs
// (an unhandled rejection, a crash mid-chain) must not stay "running" forever.
const RUN_TTL_MS = 60 * 60 * 1000; // 1 hour

function pruneStaleRuns() {
	const cutoff = Date.now() - RUN_TTL_MS;
	for (const [runId, run] of activeRuns) {
		if (run.startedAt < cutoff) activeRuns.delete(runId);
	}
}

// Cron re-triggers (e.g. "Run now" while the schedule is already mid-run) register the
// same taskName twice concurrently — refCount keeps the entry alive until every
// concurrent registration for that id has unregistered, instead of the second run's
// completion prematurely erasing the still-running first one (or vice versa).
function registerRun(runId, info) {
	pruneStaleRuns();
	const existing = activeRuns.get(runId);
	activeRuns.set(runId, {
		...info,
		startedAt: existing?.startedAt ?? Date.now(),
		refCount: (existing?.refCount ?? 0) + 1
	});
}

/** Returns true once the id has no other concurrent registration left (i.e. it's actually gone). */
function unregisterRun(runId) {
	const existing = activeRuns.get(runId);
	if (!existing) return false;
	if (existing.refCount > 1) {
		activeRuns.set(runId, { ...existing, refCount: existing.refCount - 1 });
		return false;
	}
	activeRuns.delete(runId);
	return true;
}

function listActiveRuns() {
	pruneStaleRuns();
	return Array.from(activeRuns, ([runId, run]) => ({ runId, ...run }));
}

module.exports = { registerRun, unregisterRun, listActiveRuns };
