/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

// Screenshots and rrweb batches share one directory (and one scan) — the test
// process runs several levels below whatever calls this, with no direct pipe
// back, so both live-stream the same way: small files dropped and picked up.
function startSsPoller(ssDir, onScreenshot, onRRwebBatch) {
	const seenFiles = new Set();
	return setInterval(() => {
		try {
			const files = fs
				.readdirSync(ssDir)
				.filter((f) => f.endsWith('.ss.json') || f.endsWith('.rrweb.json'))
				.sort();
			for (const f of files) {
				if (seenFiles.has(f)) continue;
				seenFiles.add(f);
				const filePath = path.join(ssDir, f);
				const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				if (f.endsWith('.rrweb.json')) onRRwebBatch?.(data);
				else onScreenshot(data);
				try {
					fs.unlinkSync(filePath);
				} catch {}
			}
		} catch {}
	}, 400);
}

module.exports = { startSsPoller };
