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
 * Reads a run's own report file and removes it. Each lane writes to its own path
 * so concurrent lanes cannot clobber one another, and the file is transient, the
 * report it produced is persisted to the database by the caller.
 */
function readReportFile(filePath) {
	try {
		if (!fs.existsSync(filePath)) return null;
		const raw = fs.readFileSync(filePath, 'utf8');
		fs.rmSync(filePath, { force: true });
		return raw;
	} catch {
		return null;
	}
}

module.exports = { REPORTS_DIR, readReportFile };
