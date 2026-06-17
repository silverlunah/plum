/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

/**
 * Helpers for the operator-facing `plum node` flow: generate a node auth token,
 * guess a reachable address, persist the node's identity, and self-register the
 * node with a primary Plum server.
 *
 * Uses only Node builtins (os/crypto/fetch) so it runs before backend deps are
 * installed and can be imported from the published `bin/plum.js`.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILENAME = '.plum-node.json';

function generateToken() {
	return crypto.randomBytes(24).toString('hex');
}

/** First non-internal IPv4 address, or 'localhost' if none is found. */
function detectLanIp() {
	for (const addrs of Object.values(os.networkInterfaces())) {
		for (const addr of addrs ?? []) {
			if (addr.family === 'IPv4' && !addr.internal) return addr.address;
		}
	}
	return 'localhost';
}

function configPath(dir) {
	return path.join(dir, CONFIG_FILENAME);
}

function loadNodeConfig(dir) {
	try {
		return JSON.parse(fs.readFileSync(configPath(dir), 'utf8'));
	} catch {
		return {};
	}
}

function saveNodeConfig(dir, cfg) {
	fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/**
 * Registers the node with the primary, reusing an existing runner whose name+url
 * match instead of creating a duplicate.
 *
 * @returns {Promise<{ id: string, reused: boolean }>}
 * @throws {Error} when the primary is unreachable or rejects the request
 */
async function registerWithPrimary({ primary, name, url, token, browser }) {
	const base = primary.replace(/\/$/, '');

	let existing = null;
	const listRes = await fetch(`${base}/runners`, { signal: AbortSignal.timeout(10000) });
	if (!listRes.ok) throw new Error(`primary returned HTTP ${listRes.status} listing runners`);
	const { runners = [] } = await listRes.json();
	existing = runners.find((r) => r.name === name && r.url === url) ?? null;
	if (existing) return { id: existing.id, reused: true };

	const res = await fetch(`${base}/runners`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, url, token, browser }),
		signal: AbortSignal.timeout(10000)
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.error) {
		throw new Error(body.error || `primary returned HTTP ${res.status}`);
	}
	return { id: body.runner.id, reused: false };
}

module.exports = {
	CONFIG_FILENAME,
	generateToken,
	detectLanIp,
	loadNodeConfig,
	saveNodeConfig,
	registerWithPrimary
};
