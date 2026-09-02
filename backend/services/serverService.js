/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const PACKAGE = 'plum-e2e';
const NPM_URL = `https://registry.npmjs.org/${PACKAGE}/latest`;
// The version check reads npm (that's where `plum update` pulls from); the
// changelog the banner links to lives in GitHub Releases.
const RELEASES_PAGE = 'https://github.com/silverlunah/plum/releases';

// Written into the backend container's env by `plum server start`, the root
// package.json isn't in the image (only backend/package.json is).
const current = process.env.PLUM_VERSION || null;

function isNewer(latest, from) {
	if (!latest || !from) return false;
	const a = latest.split('.').map(Number);
	const b = from.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return false;
}

async function checkUpdate() {
	let latest = null;
	try {
		const res = await fetch(NPM_URL, { signal: AbortSignal.timeout(5000) });
		if (res.ok) latest = (await res.json()).version ?? null;
	} catch {
		// registry unreachable: report what we know
	}
	return {
		current,
		latest,
		updateAvailable: isNewer(latest, current),
		releaseNotesUrl: RELEASES_PAGE,
		command: 'plum update'
	};
}

module.exports = { checkUpdate };
