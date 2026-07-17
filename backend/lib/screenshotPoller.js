/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');

function startSsPoller(ssDir, onScreenshot) {
	const seenFiles = new Set();
	return setInterval(() => {
		try {
			const files = fs
				.readdirSync(ssDir)
				.filter((f) => f.endsWith('.ss.json'))
				.sort();
			for (const f of files) {
				if (seenFiles.has(f)) continue;
				seenFiles.add(f);
				const filePath = path.join(ssDir, f);
				const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				onScreenshot(data);
				try {
					fs.unlinkSync(filePath);
				} catch {}
			}
		} catch {}
	}, 400);
}

module.exports = { startSsPoller };
