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
 * Lifecycle helpers for local node-runner processes.
 *
 * A runner is registered in the primary DB, but the actual worker is an
 * independent `PLUM_MODE=node` process. This module starts those processes
 * detached (so they outlive the launching terminal) and tracks their PIDs in a
 * small JSON registry so a later CLI invocation can stop or restart them.
 *
 * Only runners whose URL points at this machine can be controlled here.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(BACKEND_DIR, 'server.js');
const REGISTRY_PATH = path.join(BACKEND_DIR, '.runners.local.json');
const LOGS_DIR = path.join(BACKEND_DIR, 'logs');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

function loadRegistry() {
	try {
		return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
	} catch {
		return {};
	}
}

function saveRegistry(registry) {
	fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

/**
 * Returns the PID of the process listening on the given TCP port, or null.
 * Uses lsof on macOS/Linux and netstat on Windows.
 */
function findPidOnPort(port) {
	const portStr = String(port);
	try {
		if (process.platform === 'win32') {
			const out = execSync('netstat -ano', { encoding: 'utf8' });
			for (const line of out.split('\n')) {
				const upper = line.toUpperCase();
				if (upper.includes(`:${portStr}`) && upper.includes('LISTENING')) {
					const parts = line.trim().split(/\s+/);
					const pid = parseInt(parts[parts.length - 1], 10);
					if (!isNaN(pid) && pid > 0) return pid;
				}
			}
		} else {
			const out = execSync(`lsof -i :${portStr} -t -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
			if (out) {
				const pid = parseInt(out.split('\n')[0].trim(), 10);
				if (!isNaN(pid) && pid > 0) return pid;
			}
		}
	} catch {}
	return null;
}

// Signal 0 performs the OS-level permission/existence check without actually
// delivering a signal — the portable way to ask "is this pid alive?".
function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function isLocalUrl(url) {
	try {
		return LOCAL_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

function parsePort(url) {
	try {
		return new URL(url).port || '3001';
	} catch {
		return '3001';
	}
}

/** Drops registry entries whose process has died and persists the result. */
function pruneDead(registry = loadRegistry()) {
	let changed = false;
	for (const [id, entry] of Object.entries(registry)) {
		if (!entry?.pid || !isAlive(entry.pid)) {
			delete registry[id];
			changed = true;
		}
	}
	if (changed) saveRegistry(registry);
	return registry;
}

/** 'running' if this manager owns a live process for the runner, else 'stopped'. */
function statusOf(id, registry = loadRegistry()) {
	const entry = registry[id];
	return entry?.pid && isAlive(entry.pid) ? 'running' : 'stopped';
}

/**
 * Ensures a local node can actually run tests: backend dependencies must be
 * installed and the Playwright browser binaries present. A node with neither
 * starts fine but every scenario fails at the browser-launch hook. Idempotent —
 * npm install is skipped when node_modules already exists, and `playwright
 * install` no-ops when the browser is already downloaded.
 *
 * npm/npx are .cmd shims on Windows, so these must run through a shell.
 *
 * stdin is left as 'ignore' (not inherited): these installers only need to
 * print progress, and letting them touch stdin corrupts the raw-mode state of
 * an interactive prompt running in the same terminal (the caller's menu would
 * wedge after the install finishes).
 */
function prepareEnv() {
	const stdio = ['ignore', 'inherit', 'inherit'];
	if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
		execSync('npm install', { cwd: BACKEND_DIR, stdio, shell: true });
	}
	execSync('npx playwright install chromium firefox', { cwd: BACKEND_DIR, stdio, shell: true });
}

/**
 * Spawns a detached node-mode server for the given runner and records its pid.
 * Returns the registry entry.
 */
function startNode({ id, port, token }) {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
	const logFile = path.join(LOGS_DIR, `runner-${id}.log`);
	const out = fs.openSync(logFile, 'a');

	const child = spawn(process.execPath, [SERVER_PATH], {
		cwd: BACKEND_DIR,
		env: {
			...process.env,
			NODE_TOKEN: token,
			PLUM_MODE: 'node',
			PORT: String(port),
			RUNNER_ID: String(id)
		},
		detached: true,
		stdio: ['ignore', out, out],
		windowsHide: true
	});
	child.unref();
	fs.closeSync(out);

	const registry = loadRegistry();
	const entry = { pid: child.pid, port: String(port), logFile, startedAt: Date.now() };
	registry[id] = entry;
	saveRegistry(registry);
	return entry;
}

/**
 * Stops the managed process for a runner. Returns true if a live process was
 * signalled, false if nothing was running.
 *
 * Falls back to port-based PID discovery when the registry entry is missing or
 * its PID is stale, using the port stored in the entry or an explicit fallback.
 */
function stopNode(id, fallbackPort = null) {
	const registry = loadRegistry();
	const entry = registry[id];
	let signalled = false;

	let pid = entry?.pid && isAlive(entry.pid) ? entry.pid : null;

	if (!pid) {
		const port = fallbackPort ?? (entry?.port ? Number(entry.port) : null);
		if (port) pid = findPidOnPort(port);
	}

	if (pid) {
		try {
			process.kill(pid, 'SIGTERM');
			signalled = true;
		} catch {}
	}
	delete registry[id];
	saveRegistry(registry);
	return signalled;
}

module.exports = {
	BACKEND_DIR,
	LOGS_DIR,
	REGISTRY_PATH,
	loadRegistry,
	saveRegistry,
	isAlive,
	isLocalUrl,
	parsePort,
	findPidOnPort,
	pruneDead,
	statusOf,
	prepareEnv,
	startNode,
	stopNode
};
