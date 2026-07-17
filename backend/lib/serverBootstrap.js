/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const { loadRegistry, saveRegistry } = require('./runnerProcess');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

const WATCH_OPTS = { usePolling: true, interval: 800, ignoreInitial: true };

function ensureTestsDir(testsDir, isNodeMode) {
	if (fs.existsSync(testsDir)) {
		console.log('📂 Loading tests from:', testsDir);
		return;
	}
	if (isNodeMode) {
		console.warn('⚠️  No tests folder found — will be populated when a job is received');
		return;
	}
	console.error('❌ No tests folder found at /app/tests');
	process.exit(1);
}

// A self-restart (POST /api/restart) spawns the replacement before this
// process has released the port, so the first bind attempt can briefly hit
// EADDRINUSE — retry instead of dying immediately.
function attachListenRetry(server, port) {
	let retriesLeft = 20;
	server.on('error', (err) => {
		if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
			retriesLeft -= 1;
			setTimeout(() => server.listen(port), 250);
		} else {
			console.error(`❌ Failed to bind port ${port}:`, err.message);
			process.exit(1);
		}
	});
}

function wireRealtimeServices(io, isNodeMode) {
	if (isNodeMode) return { cronService: null, backupCronService: null };

	const socketHandler = require('../websockets/socketHandler.js');
	const cronService = require('../services/cronService');
	const backupCronService = require('../services/backupCronService');

	socketHandler(io);
	cronService.setSocketIO(io);
	require('../routes/trigger.routes').setSocketIO(io);

	return { cronService, backupCronService };
}

async function initCronServices(cronService, backupCronService) {
	if (cronService) await cronService.init();
	if (backupCronService) await backupCronService.init();
}

async function bootstrapMcpKey(isNodeMode) {
	if (isNodeMode || process.env.PLUM_MCP_KEY) return;
	try {
		const settingsService = require('../services/settingsService');
		const { mcpKey } = await settingsService.getMcpConfig();
		if (mcpKey) process.env.PLUM_MCP_KEY = mcpKey;
	} catch {}
}

function logServerReady(port, isNodeMode) {
	console.log(`Backend running on port ${port}${isNodeMode ? ' (node/runner mode)' : ''}`);
}

// Dispatches to the node-runner startup path or the full-server startup path
// once the HTTP server is actually listening.
async function onServerListening({ port, io, testsDir, isNodeMode }) {
	logServerReady(port, isNodeMode);
	if (isNodeMode) {
		handleNodeModeStartup(port);
		return;
	}
	await handleFullModeStartup(io, testsDir);
}

function handleNodeModeStartup(port) {
	// Self-register PID so manage-runners can track and stop this process.
	const runnerId = process.env.RUNNER_ID;
	if (!runnerId) return;

	const registry = loadRegistry();
	registry[runnerId] = { pid: process.pid, port: String(port), startedAt: Date.now() };
	saveRegistry(registry);

	const cleanup = () => {
		try {
			const reg = loadRegistry();
			// A self-restart already wrote the replacement's pid under this
			// id before this process exits — only touch the entry if it's
			// still ours, so we don't clobber the new process's registration.
			// Keep the entry (with its port) rather than deleting it — that's
			// the only place a later manual Start can find the port this
			// runner was last running on.
			if (reg[runnerId]?.pid === process.pid) {
				reg[runnerId] = { ...reg[runnerId], pid: null };
				saveRegistry(reg);
			}
		} catch {}
	};

	// Adding a SIGTERM/SIGINT listener suppresses Node's default
	// "terminate immediately" behavior — the handler must exit itself,
	// or the process (and the port it's bound to) lives on forever
	// after a plain `kill`/SIGTERM with nothing left to stop it short
	// of SIGKILL.
	process.once('SIGTERM', () => {
		cleanup();
		process.exit(0);
	});
	process.once('SIGINT', () => {
		cleanup();
		process.exit(0);
	});
	process.once('exit', cleanup);
}

async function handleFullModeStartup(io, testsDir) {
	syncAutomatedFlags();

	const chokidar = await loadChokidar();
	if (!chokidar) return;

	watchTestFiles(chokidar, io, testsDir);
	watchReports(chokidar, io);
}

function syncAutomatedFlags() {
	// Sync automated flags from feature files on every startup
	require('../services/reportService')
		.syncAutomatedFromFeatures()
		.catch(() => {});
}

async function loadChokidar() {
	// chokidar v5+ is ESM-only — use dynamic import to stay compatible with CJS
	try {
		return (await import('chokidar')).default;
	} catch {
		console.warn('⚠️  chokidar unavailable — file watching disabled');
		return null;
	}
}

function watchTestFiles(chokidar, io, testsDir) {
	const featuresDir = path.join(testsDir, 'features');
	if (!fs.existsSync(featuresDir)) return;

	let debounce = null;
	chokidar.watch(featuresDir, WATCH_OPTS).on('all', (event, filePath) => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			console.log(`📝 Tests changed (${event}: ${path.basename(filePath)}) — notifying clients`);
			io.emit(SOCKET_EVENTS.TESTS_CHANGED);
			syncAutomatedFlags();
		}, 300);
	});
	console.log('👀 Watching for test file changes...');
}

function watchReports(chokidar, io) {
	const reportsDir = path.resolve(process.cwd(), 'reports');
	fs.mkdirSync(reportsDir, { recursive: true });

	chokidar.watch(reportsDir, { ...WATCH_OPTS, interval: 1200 }).on('add', (filePath) => {
		const name = path.basename(filePath);
		if ((name.startsWith('PASS_') || name.startsWith('FAIL_')) && name.endsWith('.json')) {
			console.log(`📊 New report: ${name} — notifying clients`);
			io.emit(SOCKET_EVENTS.REPORT_READY);
		}
	});
	console.log('👀 Watching for new reports...');
}

module.exports = {
	ensureTestsDir,
	attachListenRetry,
	wireRealtimeServices,
	initCronServices,
	bootstrapMcpKey,
	onServerListening
};
