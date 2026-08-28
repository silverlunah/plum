/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

// The test process runs several levels below whatever calls this, with no
// direct pipe back, so rrweb batches live-stream by small files dropped and
// picked up here.
function startRRwebPoller(ssDir, onRRwebBatch) {
	const seenFiles = new Set();
	return setInterval(() => {
		try {
			const files = fs
				.readdirSync(ssDir)
				.filter((f) => f.endsWith('.rrweb.json'))
				.sort();
			for (const f of files) {
				if (seenFiles.has(f)) continue;
				seenFiles.add(f);
				const filePath = path.join(ssDir, f);
				const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				onRRwebBatch?.(data);
				try {
					fs.unlinkSync(filePath);
				} catch {}
			}
		} catch {}
	}, 400);
}

module.exports = { startRRwebPoller };
