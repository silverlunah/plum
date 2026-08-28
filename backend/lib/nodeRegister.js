/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Named node store — one dir per node under ~/.plum/nodes/<name>/, so a machine
// can run several nodes without the operator juggling working directories (a
// second `plum node start` from the same folder used to overwrite the first
// node's config and orphan its process).
// ---------------------------------------------------------------------------

function nodesRoot() {
	return path.join(os.homedir(), '.plum', 'nodes');
}

/** The config dir for a node by name (created on save). */
function nodeHome(name) {
	return path.join(nodesRoot(), name);
}

/** Names of every node this machine has a config for. */
function listNodeNames() {
	try {
		return fs
			.readdirSync(nodesRoot(), { withFileTypes: true })
			.filter(
				(e) => e.isDirectory() && fs.existsSync(path.join(nodesRoot(), e.name, CONFIG_FILENAME))
			)
			.map((e) => e.name);
	} catch {
		return [];
	}
}

function loadNodeByName(name) {
	return loadNodeConfig(nodeHome(name));
}

function saveNodeByName(name, cfg) {
	saveNodeConfig(nodeHome(name), cfg);
}

/** Removes a node's whole config dir. */
function deleteNodeByName(name) {
	fs.rmSync(nodeHome(name), { recursive: true, force: true });
}

/**
 * One-time move of any legacy `.plum-node.json` (written into an arbitrary
 * working directory by older `plum node start`) into the named store. Returns
 * the names it imported. Leaves the old files in place.
 */
function migrateLegacyNodes(legacyDirs) {
	const imported = [];
	for (const dir of legacyDirs || []) {
		if (dir.startsWith(nodesRoot())) continue;
		const cfg = loadNodeConfig(dir);
		if (!cfg.name || fs.existsSync(configPath(nodeHome(cfg.name)))) continue;
		saveNodeByName(cfg.name, cfg);
		imported.push(cfg.name);
	}
	return imported;
}

/**
 * Registers the node with the primary. POST /runners upserts on name+url, so
 * re-running this refreshes the token on the existing runner rather than
 * duplicating it — `reused` is reported for messaging only.
 *
 * @returns {Promise<{ id: string, reused: boolean }>}
 * @throws {Error} when the primary is unreachable or rejects the request
 */
async function registerWithPrimary({ primary, name, url, token, browser }) {
	const base = primary.replace(/\/$/, '');

	let reused = false;
	try {
		const listRes = await fetch(`${base}/runners`, { signal: AbortSignal.timeout(10000) });
		if (listRes.ok) {
			const { runners = [] } = await listRes.json();
			reused = runners.some((r) => r.name === name && r.url === url);
		}
	} catch {}

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
	return { id: body.runner.id, reused };
}

module.exports = {
	CONFIG_FILENAME,
	generateToken,
	detectLanIp,
	loadNodeConfig,
	saveNodeConfig,
	nodesRoot,
	nodeHome,
	listNodeNames,
	loadNodeByName,
	saveNodeByName,
	deleteNodeByName,
	migrateLegacyNodes,
	registerWithPrimary
};
