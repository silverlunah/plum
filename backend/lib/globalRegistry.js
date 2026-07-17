/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * `.plum-server.json`/`.plum-node.json` live in whatever directory the user
 * happened to run `plum server start`/`plum node start` from. `plum update`
 * needs to find and restart those installs later regardless of the cwd it's
 * invoked from — this is the one place, independent of any project
 * directory, that remembers where they are.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_DIR = path.join(os.homedir(), '.plum');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'installs.json');

function load() {
	try {
		return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
	} catch {
		return { server: [], node: [] };
	}
}

function save(data) {
	fs.mkdirSync(REGISTRY_DIR, { recursive: true });
	fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Records `dir` as a known `type` ('server' | 'node') install location. */
function registerInstall(type, dir) {
	const data = load();
	if (!data[type]) data[type] = [];
	if (!data[type].includes(dir)) {
		data[type].push(dir);
		save(data);
	}
}

/** Known install dirs for `type`, pruned of any that no longer exist on disk. */
function getInstalls(type) {
	const data = load();
	const dirs = (data[type] || []).filter((d) => fs.existsSync(d));
	if (dirs.length !== (data[type] || []).length) {
		data[type] = dirs;
		save(data);
	}
	return dirs;
}

module.exports = { REGISTRY_PATH, registerInstall, getInstalls };
