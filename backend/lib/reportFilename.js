/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const fs = require('fs');

// Under data/ because that is the mounted, persistent path: see appSecret.js. Each
// lane writes its raw report here and the backend deletes it once ingested, so the
// folder is a staging area, not a store.
const REPORTS_DIR = path.resolve(__dirname, '..', 'data', 'reports');

/**
 * Merges plumStepReporter's sidecar into the report it sits beside, under a key
 * of Plum's own, and removes it. Carrying the timings inside the report means the
 * one string a node already sends back brings them along, with no second file to
 * transfer. A Cucumber run has no sidecar and comes back untouched.
 */
function foldStepTimings(filePath, raw) {
	const sidecar = `${filePath}.steps.json`;
	try {
		if (!fs.existsSync(sidecar)) return raw;
		const steps = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
		fs.rmSync(sidecar, { force: true });
		return JSON.stringify({ ...JSON.parse(raw), plumSteps: steps });
	} catch {
		// The report itself is what matters; without the timings the steps still
		// come from the JSON's own, minus the ones that ran in a hook.
		fs.rmSync(sidecar, { force: true });
		return raw;
	}
}

/**
 * Reads a run's own report file and removes it. Each lane writes to its own path
 * so concurrent lanes cannot clobber one another, and the file is transient, the
 * report it produced is persisted to the database by the caller.
 */
function readReportFile(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null;
		const raw = fs.readFileSync(filePath, 'utf8');
		fs.rmSync(filePath, { force: true });
		return foldStepTimings(filePath, raw);
	} catch {
		return null;
	}
}

module.exports = { REPORTS_DIR, readReportFile, foldStepTimings };
