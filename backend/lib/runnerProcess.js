/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { PLUM_MODE_NODE, DEFAULT_PORT } = require('../constants/env');

const BACKEND_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(BACKEND_DIR, 'server.js');
const REGISTRY_PATH = path.join(BACKEND_DIR, '.runners.local.json');
const LOGS_DIR = path.join(BACKEND_DIR, 'logs');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

/**
 * Runners default to this machine's own LAN IP (see nodeRegister's
 * detectLanIp), not a loopback hostname — so isLocalUrl must also recognise
 * this machine's actual interface addresses, or a runner started and later
 * stopped on this same box gets misclassified as remote and loses its
 * "Start" option (nothing else can restart a fully-stopped process for it).
 */
function localAddresses() {
	const addrs = new Set(LOCAL_HOSTS);
	for (const ifaces of Object.values(os.networkInterfaces())) {
		for (const iface of ifaces ?? []) {
			if (iface.family === 'IPv4' || iface.family === 4) addrs.add(iface.address);
		}
	}
	return addrs;
}

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
				if (!line.toUpperCase().includes('LISTENING')) continue;
				const parts = line.trim().split(/\s+/);
				// Columns: Proto, Local Address, Foreign Address, State, PID.
				// Match the port exactly off the local address (e.g. "0.0.0.0:3002"
				// or "[::]:3002") — a substring check would false-positive port
				// "300" against "3002", "13000", etc.
				const localAddress = parts[1] ?? '';
				const localPort = localAddress.slice(localAddress.lastIndexOf(':') + 1);
				if (localPort !== portStr) continue;
				const pid = parseInt(parts[parts.length - 1], 10);
				if (!isNaN(pid) && pid > 0) return pid;
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
		return localAddresses().has(new URL(url).hostname);
	} catch {
		return false;
	}
}

function parsePort(url) {
	try {
		return new URL(url).port || DEFAULT_PORT;
	} catch {
		return DEFAULT_PORT;
	}
}

/**
 * Clears the pid of registry entries whose process has died, and persists the
 * result. Keeps the entry itself (with its `port`) rather than deleting it —
 * that's the only place the last-used port for a runner is remembered, so a
 * later Start can reuse it instead of falling back to whatever's in the
 * runner's URL (or a hardcoded default, if the URL has no explicit port).
 */
function pruneDead(registry = loadRegistry()) {
	let changed = false;
	for (const [id, entry] of Object.entries(registry)) {
		if (entry?.pid && !isAlive(entry.pid)) {
			registry[id] = { ...entry, pid: null };
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
 * Installs backend npm dependencies if missing or stale. Shared by `prepareEnv`
 * (which additionally provisions Playwright browsers for test execution) and
 * any caller that only needs `backend/node_modules` to exist, such as `plum
 * mcp` — spawning the MCP server without this guard fails outright if the
 * package was reinstalled/updated since the last time deps were installed
 * (npm install -g wipes node_modules on upgrade) and the user never ran a
 * command that happens to call prepareEnv first.
 *
 * npm is a .cmd shim on Windows, so this must run through a shell.
 *
 * stdin is left as 'ignore' (not inherited): the installer only needs to
 * print progress, and letting it touch stdin corrupts the raw-mode state of
 * an interactive prompt running in the same terminal (the caller's menu would
 * wedge after the install finishes).
 */
function ensureBackendDeps() {
	const markerPath = path.join(BACKEND_DIR, 'node_modules', '.plum-version');
	let installedVersion = null;
	try {
		installedVersion = fs.readFileSync(markerPath, 'utf8').trim();
	} catch {}
	const currentVersion = JSON.parse(
		fs.readFileSync(path.join(BACKEND_DIR, '..', 'package.json'), 'utf8')
	).version;

	if (
		!fs.existsSync(path.join(BACKEND_DIR, 'node_modules')) ||
		installedVersion !== currentVersion
	) {
		execSync('npm install', {
			cwd: BACKEND_DIR,
			stdio: ['ignore', 'inherit', 'inherit'],
			shell: true
		});
		fs.writeFileSync(markerPath, currentVersion, 'utf8');
	}
}

/**
 * Ensures a local node can actually run tests: backend dependencies must be
 * installed and the Playwright browser binaries present. A node with neither
 * starts fine but every scenario fails at the browser-launch hook. Idempotent —
 * npm install is skipped when node_modules already exists, and `playwright
 * install` no-ops when the browser is already downloaded.
 */
function prepareEnv() {
	ensureBackendDeps();

	// --with-deps also installs the OS-level shared libraries (libnss3, libatk,
	// etc.) Chromium/Firefox need to actually launch — without it, a fresh
	// Linux host has the browser binaries but fails at launch time with
	// "Host system is missing dependencies to run browsers."
	execSync('npx playwright install --with-deps chromium firefox', {
		cwd: BACKEND_DIR,
		stdio: ['ignore', 'inherit', 'inherit'],
		shell: true
	});
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
			PLUM_MODE: PLUM_MODE_NODE,
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
	const port = fallbackPort ?? (entry?.port ? Number(entry.port) : null);

	if (!pid && port) {
		pid = findPidOnPort(port);
	}

	if (pid) {
		try {
			process.kill(pid, 'SIGTERM');
			signalled = true;
		} catch {}
	}

	// Keep the port on record (clearing only the pid) so a later Start reuses
	// the same port instead of falling back to the runner's URL — which may
	// not even have an explicit port — or a hardcoded default.
	if (port) {
		registry[id] = { ...entry, pid: null, port: String(port) };
	} else {
		delete registry[id];
	}
	saveRegistry(registry);
	return signalled;
}

/**
 * Frees a TCP port by killing whatever process is bound to it, so Start can't
 * fail with EADDRINUSE against a stale/orphaned process this manager lost
 * track of (e.g. one that ignored SIGTERM from a previous stop, or was never
 * in the registry to begin with). SIGTERM first, escalating to SIGKILL if the
 * process is still alive after a short grace period.
 *
 * Returns true if a process was found (and signalled), false if the port was
 * already free.
 */
async function killPort(port) {
	let pid = findPidOnPort(port);
	if (!pid) return false;

	try {
		process.kill(pid, 'SIGTERM');
	} catch {}

	const deadline = Date.now() + 2000;
	while (Date.now() < deadline && isAlive(pid)) {
		await new Promise((resolve) => setTimeout(resolve, 150));
	}

	pid = findPidOnPort(port);
	if (pid && isAlive(pid)) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	return true;
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
	killPort,
	pruneDead,
	statusOf,
	ensureBackendDeps,
	prepareEnv,
	startNode,
	stopNode
};
