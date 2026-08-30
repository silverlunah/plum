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
	if (isNodeMode) return { cronService: null, backupCronService: null, runQueueService: null };

	const socketHandler = require('../websockets/socketHandler.js');
	const cronService = require('../services/cronService');
	const backupCronService = require('../services/backupCronService');
	const runQueueService = require('../services/runQueueService');

	socketHandler(io);
	runQueueService.setSocketIO(io);

	return { cronService, backupCronService, runQueueService };
}

async function initCronServices(cronService, backupCronService) {
	if (cronService) await cronService.init();
	if (backupCronService) await backupCronService.init();
}

// MCP keys are per-project now and resolved live from the DB in jwtAuth — the
// only global key is an optional PLUM_MCP_KEY env override (CI). Kept exported
// so server.js's call site doesn't change.
async function bootstrapMcpKey() {}

function logServerReady(port, isNodeMode) {
	console.log(`Backend running on port ${port}${isNodeMode ? ' (node mode)' : ''}`);
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
	// Self-register PID so manage-nodes can track and stop this process.
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
	await require('./projectPaths')
		.reconcile()
		.catch((e) => console.warn('⚠️  project folder reconcile failed:', e.message));
	syncAutomatedFlags();
	cleanupLegacyScreenshots();

	const chokidar = await loadChokidar();
	if (!chokidar) return;

	watchTestFiles(chokidar, testsDir);
	watchReports(chokidar, io);
}

// Report rows no longer reference screenshot files (replaced by rrweb
// recordings), so any leftover files on disk are dead weight. Safe to run
// every startup: a second pass on an already-gone directory is a no-op.
function cleanupLegacyScreenshots() {
	const screenshotsDir = path.join(process.cwd(), 'reports', 'screenshots');
	if (!fs.existsSync(screenshotsDir)) return;
	fs.rm(screenshotsDir, { recursive: true, force: true }, (err) => {
		if (!err) console.log('🧹 Removed legacy screenshots directory');
	});
}

async function syncAutomatedFlags(projectId) {
	const reportService = require('../services/reportService');
	if (projectId != null) return reportService.syncAutomatedFromFeatures(projectId).catch(() => {});
	// startup: every project
	try {
		const prisma = require('../services/prisma');
		const projects = await prisma.project.findMany({ select: { id: true } });
		for (const p of projects) await reportService.syncAutomatedFromFeatures(p.id).catch(() => {});
	} catch {}
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

function watchTestFiles(chokidar, testsDir) {
	// Legacy single-project dir + every per-project folder
	// (projects/<slug>/tests/features). Any change re-syncs all projects — there
	// are only a handful, and mapping the changed path back to a project id isn't
	// worth the slug lookup.
	const projectsDir = process.env.PROJECTS_DIR || path.join(path.dirname(testsDir), 'projects');
	const targets = [
		path.join(testsDir, 'features'),
		path.join(projectsDir, '*', 'tests', 'features')
	];

	let debounce = null;
	chokidar.watch(targets, WATCH_OPTS).on('all', (event, filePath) => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			console.log(`📝 Tests changed (${event}: ${path.basename(filePath)})`);
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
