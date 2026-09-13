/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

// Under data/ because that is the mounted, persistent path (see lib/appSecret.js):
// unlike backend/data/reports (a transient staging area, emptied per run), files
// written here are meant to outlive a container restart, so this cannot be the
// same directory. Kept out of Postgres entirely on purpose, a screenshot is a PNG,
// not something that benefits from living in a JSONB/BYTEA column.
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'data', 'screenshots');

function screenshotPathFor(filename) {
	return path.join(SCREENSHOTS_DIR, filename);
}

function writeScreenshot(filename, buffer) {
	fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
	fs.writeFileSync(screenshotPathFor(filename), buffer);
}

function deleteScreenshot(filename) {
	try {
		fs.rmSync(screenshotPathFor(filename), { force: true });
	} catch {
		// best-effort: a missing file is not an error
	}
}

// Playwright's own `screenshot: 'only-on-failure'` config attaches the PNG by
// `path` (a file on whichever machine ran the test), never inlined, unlike
// Plum's own rrweb/worker attachments (testInfo.attach with an in-memory
// buffer, always inlined as base64 `body`). For a built-in run this still runs
// synchronously on the same machine, so playwrightReport.js can just read the
// path directly, but a remote node's `path` is meaningless once its JSON report
// crosses the network to the primary. Inlining it to `body` here, before that
// report ever leaves the node, makes every attachment self-contained the same
// way the fixture already does for its own — one join-agnostic shape either way.
function inlineScreenshotAttachments(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return raw;
	}
	const walk = (node) => {
		for (const spec of node.specs ?? []) {
			for (const t of spec.tests ?? []) {
				for (const r of t.results ?? []) {
					for (const a of r.attachments ?? []) {
						if (a.name === 'screenshot' && a.contentType === 'image/png' && !a.body && a.path) {
							try {
								a.body = fs.readFileSync(a.path).toString('base64');
							} catch {
								// best-effort: a missing/unreadable file just means no screenshot
							}
						}
					}
				}
			}
		}
		for (const child of node.suites ?? []) walk(child);
	};
	for (const suite of parsed.suites ?? []) walk(suite);
	return JSON.stringify(parsed);
}

module.exports = {
	SCREENSHOTS_DIR,
	screenshotPathFor,
	writeScreenshot,
	deleteScreenshot,
	inlineScreenshotAttachments
};
