#!/usr/bin/env node
/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fse from 'fs-extra';
import * as clack from '@clack/prompts';
import pc from 'picocolors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const command = process.argv[2];
const subcommand = process.argv[3];
const plumRoot = path.resolve(__dirname, '..');
const userTestsPath = path.join(process.cwd(), 'tests');
const scaffoldTestsPath = path.join(plumRoot, 'backend', '_scaffold');
const overrideFilePath = path.join(plumRoot, 'docker-compose.override.yml');

// Paths for .env file
const rootEnvPath = path.join(process.cwd(), '.env');
const backendEnvPath = path.join(plumRoot, 'backend', '.env');

// Function to create the .env file with default values NOTE: DO NOT FORMAT envContent
function createEnvFile() {
	const envFilePath = path.join(process.cwd(), '.env');

	if (fs.existsSync(envFilePath)) {
		copyEnvFile();
		clack.log.warn('.env already exists — synced to backend.');
		return;
	}

	const envContent = `BASE_URL=https://www.saucedemo.com/v1/
IS_HEADLESS=false
`;

	fs.writeFileSync(envFilePath, envContent, 'utf8');
	clack.log.success('.env created with default values.');
}

// Scaffold plum.plugins.json if it doesn't exist yet
function scaffoldPluginsFile() {
	const pluginsPath = path.join(process.cwd(), 'plum.plugins.json');
	if (fs.existsSync(pluginsPath)) {
		clack.log.warn('plum.plugins.json already exists — skipping.');
		return;
	}
	const content = {
		'//': 'Add npm packages your tests depend on. Plum installs them automatically before each run.',
		'// example':
			'To add a package: put its name and version under "dependencies", e.g. "@faker-js/faker": "^9.0.0"',
		dependencies: {}
	};
	fs.writeFileSync(pluginsPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
	clack.log.success('plum.plugins.json created.');
}

// Install user plugins listed in plum.plugins.json into the backend
function installPlugins() {
	const pluginsPath = path.join(process.cwd(), 'plum.plugins.json');
	if (!fs.existsSync(pluginsPath)) return;

	let plugins;
	try {
		plugins = JSON.parse(fs.readFileSync(pluginsPath, 'utf8'));
	} catch {
		console.log('⚠️  Could not parse plum.plugins.json. Skipping plugin install.\n');
		return;
	}

	const deps = plugins.dependencies ?? {};
	const packages = Object.entries(deps).map(([name, version]) => `${name}@${version}`);
	if (packages.length === 0) return;

	console.log(`📦 Installing plugins: ${packages.join(', ')}\n`);
	execSync(`npm install ${packages.join(' ')}`, {
		cwd: path.join(plumRoot, 'backend'),
		stdio: 'inherit'
	});
}

// Ensure user's .gitignore contains Plum-generated entries
function ensureGitignore() {
	const gitignorePath = path.join(process.cwd(), '.gitignore');
	const plumEntries = ['.env', 'reports/'];
	const plumBlock = `\n# Plum (auto-generated)\n${plumEntries.join('\n')}\n`;

	if (!fs.existsSync(gitignorePath)) {
		fs.writeFileSync(gitignorePath, plumBlock.trimStart(), 'utf8');
		clack.log.success('.gitignore created with Plum entries.');
		return;
	}

	const existing = fs.readFileSync(gitignorePath, 'utf8');
	const missing = plumEntries.filter((e) => !existing.includes(e));
	if (missing.length === 0) {
		clack.log.warn('.gitignore already contains Plum entries — skipping.');
		return;
	}

	fs.appendFileSync(gitignorePath, `\n# Plum (auto-generated)\n${missing.join('\n')}\n`);
	clack.log.success('.gitignore updated with Plum entries.');
}

// Function to copy .env file from root to backend
function copyEnvFile() {
	try {
		if (fs.existsSync(rootEnvPath)) {
			fse.copySync(rootEnvPath, backendEnvPath);
		} else {
			clack.log.warn('.env not found in project root — skipping backend sync.');
		}
	} catch (err) {
		clack.log.error(`Error copying .env: ${err.message}`);
	}
}

const backendLib = path.join(plumRoot, 'backend', 'lib');
const serverConfigLib = () => require(path.join(backendLib, 'serverConfig.js'));
const nodeRegisterLib = () => require(path.join(backendLib, 'nodeRegister.js'));
const runnerProcessLib = () => require(path.join(backendLib, 'runnerProcess.js'));
const globalRegistryLib = () => require(path.join(backendLib, 'globalRegistry.js'));

/* -----------------------------------------------------
 *                 Interactive prompts
 * ------------------------------------------------------ */

const interactiveAllowed = () => Boolean(process.stdin.isTTY);
const getFlag = (args, name) => {
	const i = args.indexOf(name);
	return i !== -1 ? args[i + 1] : undefined;
};
const anyFlags = (args, names) => names.some((n) => args.includes(n));

function cancelAndExit() {
	clack.cancel('Cancelled.');
	process.exit(0);
}

const VALID_BROWSERS = ['chromium', 'firefox'];

// A bare host:port silently breaks link generation and CORS, so require a scheme.
async function promptPublicUrl(message, initial) {
	for (;;) {
		const v = await clack.text({
			message: `${message} — include the http:// or https:// prefix`,
			placeholder: initial,
			defaultValue: initial
		});
		if (clack.isCancel(v)) cancelAndExit();
		const val = (v || initial).trim();
		if (/^https?:\/\//i.test(val)) return val.replace(/\/+$/, '');
		clack.log.warn('That needs a full URL starting with http:// or https://');
	}
}

// onFree() fires when the user agrees to free an in-use port — lets the caller flag it for clearing.
async function promptPort(message, initial, onFree) {
	const { findPidOnPort } = runnerProcessLib();
	for (;;) {
		const v = await clack.text({
			message,
			placeholder: String(initial),
			defaultValue: String(initial)
		});
		if (clack.isCancel(v)) cancelAndExit();
		const port = (v || String(initial)).trim();
		const pid = findPidOnPort(Number(port));
		if (!pid) return port;
		const free = await clack.confirm({
			message: `Port ${port} is in use (pid ${pid}) — free it when Plum starts?`,
			initialValue: true
		});
		if (clack.isCancel(free)) cancelAndExit();
		if (free) {
			onFree();
			return port;
		}
		clack.log.warn('Pick a different port, or stop that process yourself.');
	}
}

/* -----------------------------------------------------
 *                 Server flow
 * ------------------------------------------------------ */

function mergeUserPlugins() {
	const userPluginsPath = path.join(process.cwd(), 'plum.plugins.json');
	if (!fs.existsSync(userPluginsPath)) return;
	try {
		const userPlugins = JSON.parse(fs.readFileSync(userPluginsPath, 'utf8'));
		const backendPkgPath = path.join(plumRoot, 'backend', 'package.json');
		const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
		const pluginDeps = userPlugins.dependencies ?? {};
		if (Object.keys(pluginDeps).length > 0) {
			backendPkg.dependencies = { ...backendPkg.dependencies, ...pluginDeps };
			fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, '\t') + '\n', 'utf8');
			clack.log.info(`Merged plugins into backend: ${Object.keys(pluginDeps).join(', ')}`);
		}
	} catch {
		clack.log.warn('Could not read plum.plugins.json. Skipping plugin merge.');
	}
}

async function configureServer({ force }) {
	const { loadServerConfig, saveServerConfig } = serverConfigLib();
	const cwd = process.cwd();
	const args = process.argv.slice(3);
	const cfg = loadServerConfig(cwd);

	const overrides = {
		headless: getFlag(args, '--headless'),
		mode: getFlag(args, '--mode'),
		backendPort: getFlag(args, '--backend-port'),
		frontendPort: getFlag(args, '--frontend-port'),
		apiUrl: getFlag(args, '--api-url'),
		uiUrl: getFlag(args, '--ui-url')
	};
	if (overrides.headless !== undefined) cfg.headless = overrides.headless === 'true';
	if (overrides.mode !== undefined) cfg.mode = overrides.mode;
	if (overrides.backendPort !== undefined) cfg.backendPort = overrides.backendPort;
	if (overrides.frontendPort !== undefined) cfg.frontendPort = overrides.frontendPort;
	if (overrides.apiUrl !== undefined) cfg.apiUrl = overrides.apiUrl;
	if (overrides.uiUrl !== undefined) cfg.uiUrl = overrides.uiUrl;

	const hasFlags = anyFlags(args, [
		'--headless',
		'--mode',
		'--backend-port',
		'--frontend-port',
		'--api-url',
		'--ui-url'
	]);
	const interactive = force || (interactiveAllowed() && !hasFlags);

	if (interactive) {
		const mode = await clack.select({
			message: 'Where are you setting up Plum?',
			options: [
				{ value: 'production', label: 'Production / Network server' },
				{ value: 'local', label: 'Local machine' }
			],
			initialValue: cfg.mode === 'production' ? 'production' : 'local'
		});
		if (clack.isCancel(mode)) cancelAndExit();
		cfg.mode = mode;

		const useDefaults = await clack.confirm({
			message:
				'Use the default ports (backend 3001, frontend 3002)? ' +
				'Any process already using those ports will be stopped.'
		});
		if (clack.isCancel(useDefaults)) cancelAndExit();

		if (useDefaults) {
			cfg.backendPort = '3001';
			cfg.frontendPort = '3002';
			cfg.clearPorts = true;
			clack.log.warn(
				'Ports 3001 and 3002 will be freed before Plum starts. ' +
					'The database runs inside Docker and is not affected.'
			);
		} else {
			cfg.backendPort = await promptPort('Backend port', cfg.backendPort, () => {
				cfg.clearPorts = true;
			});
			cfg.frontendPort = await promptPort('Frontend (UI) port', cfg.frontendPort, () => {
				cfg.clearPorts = true;
			});
		}

		if (mode === 'production') {
			cfg.apiUrl = await promptPublicUrl(
				'Public URL of the Plum backend / API',
				cfg.apiUrl || `http://localhost:${cfg.backendPort}`
			);
			cfg.uiUrl = await promptPublicUrl(
				'Public URL of the Plum UI (frontend)',
				cfg.uiUrl || `http://localhost:${cfg.frontendPort}`
			);
		} else {
			cfg.apiUrl = `http://localhost:${cfg.backendPort}`;
			cfg.uiUrl = `http://localhost:${cfg.frontendPort}`;
		}

		const headless = await clack.confirm({
			message: 'Run browsers headless?',
			initialValue: cfg.headless
		});
		if (clack.isCancel(headless)) cancelAndExit();
		cfg.headless = headless;
	} else {
		if (!cfg.mode) cfg.mode = 'local';
		if (!cfg.apiUrl) cfg.apiUrl = `http://localhost:${cfg.backendPort}`;
		if (!cfg.uiUrl) cfg.uiUrl = `http://localhost:${cfg.frontendPort}`;
	}

	saveServerConfig(cwd, cfg);
	globalRegistryLib().registerInstall('server', cwd);
	return cfg;
}

function applyServerConfig(cfg) {
	const { writeEnvFile, buildOverrideYaml } = serverConfigLib();
	const cwd = process.cwd();
	writeEnvFile(cwd, cfg);
	copyEnvFile();
	mergeUserPlugins();
	const testsAbs = path.resolve(cwd, 'tests').replace(/\\/g, '/');
	const reportsAbs = path.resolve(cwd, 'reports').replace(/\\/g, '/');
	fs.writeFileSync(
		overrideFilePath,
		buildOverrideYaml({
			testsAbs,
			reportsAbs,
			backendPort: cfg.backendPort,
			apiUrl: cfg.apiUrl
		}),
		'utf8'
	);
	clack.log.success('docker-compose.override.yml written');
}

// Node's fetch resolves "localhost" to ::1 first on many Linux distros (Debian
// included). If Docker only published the port on IPv4, that first attempt hangs
// until it times out on every poll, eating the whole budget even though the port
// is reachable — and reachable fine from a browser, which races both families.
// 127.0.0.1 sidesteps the DNS/happy-eyeballs mismatch entirely.
const READY_POLL_INTERVAL_MS = 2000;
const READY_POLL_MAX_ATTEMPTS = 90; // ~3 minutes
// Each poll attempt must itself be bounded — a single fetch() with no timeout
// can hang on a stale/dead connection (e.g. right after a container restart)
// and stall the whole loop indefinitely, regardless of the attempt budget
// above. This is what caused the intermittent endless "Waiting for server to
// be ready…" even when the server was already reachable elsewhere.
const FETCH_ATTEMPT_TIMEOUT_MS = 3000;

async function fetchWithTimeout(url, options = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_ATTEMPT_TIMEOUT_MS);
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

async function waitForServerReady(apiBase) {
	const s = clack.spinner();
	s.start('Waiting for server to be ready…');
	let ready = false;
	for (let i = 0; i < READY_POLL_MAX_ATTEMPTS; i++) {
		await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
		try {
			const res = await fetchWithTimeout(`${apiBase}/auth/needs-setup`);
			if (res.ok) {
				ready = true;
				break;
			}
		} catch {}
		if (i > 0 && i % 15 === 0) {
			s.message(
				`Still waiting for server to be ready… (${Math.round((i * READY_POLL_INTERVAL_MS) / 1000)}s — check "docker compose logs -f backend" if this feels stuck)`
			);
		}
	}
	s.stop(
		ready
			? pc.green('✓ Server is ready')
			: pc.yellow('Server did not respond in time — it may still be starting')
	);
	return ready;
}

async function runFirstUserSetup(apiBase, uiUrl) {
	let needsSetup = false;
	try {
		const res = await fetchWithTimeout(`${apiBase}/auth/needs-setup`);
		const data = await res.json();
		needsSetup = data.needsSetup;
	} catch {}

	if (!needsSetup) return;

	if (!interactiveAllowed()) {
		clack.log.info(
			`No users found. Open ${pc.cyan(`${uiUrl}/setup`)} to create your first account.`
		);
		return;
	}

	clack.log.info('No users found — create your first account to get started.');

	const name = await clack.text({ message: 'Your name', placeholder: 'Jane Smith' });
	if (clack.isCancel(name)) {
		clack.log.warn('Skipped. Create a user at /setup in the UI.');
		return;
	}
	const email = await clack.text({ message: 'Email address', placeholder: 'jane@example.com' });
	if (clack.isCancel(email)) {
		clack.log.warn('Skipped. Create a user at /setup in the UI.');
		return;
	}
	const password = await clack.password({ message: 'Password (min 8 characters)' });
	if (clack.isCancel(password)) {
		clack.log.warn('Skipped. Create a user at /setup in the UI.');
		return;
	}

	try {
		const res = await fetchWithTimeout(`${apiBase}/auth/setup`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, email, password })
		});
		if (res.ok) {
			clack.log.success(`Account created for ${email}. You can now log in.`);
		} else {
			const err = await res.json();
			clack.log.error(`Failed to create account: ${err.error ?? 'unknown error'}`);
		}
	} catch (e) {
		clack.log.error(`Failed to create account: ${e.message}`);
	}
}

// A stale process on the backend/frontend port fails the whole stack with a
// bind error — clear it before `docker compose up`.
async function clearServerPorts(cfg) {
	const { findPidOnPort, killPort } = runnerProcessLib();
	for (const port of [cfg.backendPort, cfg.frontendPort]) {
		const p = Number(port);
		if (findPidOnPort(p)) {
			clack.log.step(`Freeing port ${port}…`);
			await killPort(p);
		}
	}
}

// docker compose failures (port conflicts, daemon not running, etc.) must not
// crash the process with a raw stack trace — that would abort serverStart()
// before it ever reaches the first-user prompt, with no indication why.
function runDockerComposeUp(cfg) {
	try {
		execSync('docker compose up --build -d', {
			cwd: plumRoot,
			stdio: 'inherit',
			env: {
				...process.env,
				BACKEND_PORT: String(cfg.backendPort),
				FRONTEND_PORT: String(cfg.frontendPort)
			}
		});
		return true;
	} catch {
		clack.log.error(
			`Docker failed to start the stack — see the output above for the cause.\n` +
				`A common cause is another process already using port ${cfg.backendPort} or ${cfg.frontendPort}; ` +
				`try ${pc.cyan('plum server reconfig')} to pick different ports.`
		);
		return false;
	}
}

async function serverStart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Server  ')));
	const cfg = await configureServer({ force: false });
	applyServerConfig(cfg);
	clack.log.info(`UI: ${pc.cyan(cfg.uiUrl)}`);

	if (cfg.clearPorts) await clearServerPorts(cfg);

	if (!runDockerComposeUp(cfg)) {
		clack.outro(pc.red('Plum did not start.'));
		process.exitCode = 1;
		return;
	}

	const apiBase = `http://127.0.0.1:${cfg.backendPort}`;
	const ready = await waitForServerReady(apiBase);

	if (ready) {
		await runFirstUserSetup(apiBase, cfg.uiUrl);
	} else {
		clack.log.warn(
			`Could not confirm the backend is ready. Check ${pc.cyan('docker compose logs -f backend')}.\n` +
				`Once it responds, open ${pc.cyan(`${cfg.uiUrl}/setup`)} to create your first account (if this is a fresh install).`
		);
	}

	clack.log.info(`UI:  ${pc.cyan(cfg.uiUrl)}`);
	clack.log.info(`API: ${pc.cyan(cfg.apiUrl)}`);
	clack.outro(pc.green('Plum is running. Use "plum server stop" to shut down.'));
}

async function serverRestart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Server Restart  ')));
	const { loadServerConfig } = serverConfigLib();
	const cfg = loadServerConfig(process.cwd());
	applyServerConfig(cfg);
	clack.log.info(`UI: ${pc.cyan(cfg.uiUrl)}`);

	if (!runDockerComposeUp(cfg)) {
		clack.outro(pc.red('Server did not restart.'));
		process.exitCode = 1;
		return;
	}

	const apiBase = `http://127.0.0.1:${cfg.backendPort}`;
	const ready = await waitForServerReady(apiBase);
	if (!ready) {
		clack.log.warn(
			`Could not confirm the backend is ready. Check ${pc.cyan('docker compose logs -f backend')}.`
		);
	}
	clack.log.info(`UI:  ${pc.cyan(cfg.uiUrl)}`);
	clack.log.info(`API: ${pc.cyan(cfg.apiUrl)}`);
	clack.outro(pc.green('Server restarted.'));
}

// A fresh `npm publish` can take a minute or two to fully propagate across
// npm's CDN edges — hitting a stale one right after publishing produces an
// ETARGET error even though the version genuinely exists. Retry a few times
// with a short delay instead of crashing outright on what's usually transient.
const NPM_INSTALL_RETRIES = 3;
const NPM_INSTALL_RETRY_DELAY_MS = 5000;

async function npmInstallLatestWithRetry() {
	for (let attempt = 1; attempt <= NPM_INSTALL_RETRIES; attempt++) {
		try {
			execSync('npm install -g plum-e2e@latest', { stdio: 'inherit' });
			return true;
		} catch {
			if (attempt < NPM_INSTALL_RETRIES) {
				clack.log.warn(
					`npm install failed (attempt ${attempt}/${NPM_INSTALL_RETRIES}) — this is often a transient registry propagation delay right after a new release. Retrying in ${NPM_INSTALL_RETRY_DELAY_MS / 1000}s…`
				);
				await new Promise((r) => setTimeout(r, NPM_INSTALL_RETRY_DELAY_MS));
			}
		}
	}
	return false;
}

function readPlumVersion() {
	return JSON.parse(fs.readFileSync(path.join(plumRoot, 'package.json'), 'utf8')).version;
}

/** Latest version published to npm, or null when the registry can't be reached. */
function fetchLatestPublishedVersion() {
	try {
		return execSync('npm view plum-e2e version', {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
}

async function serverUpdate() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Update  ')));

	const fromVersion = readPlumVersion();
	clack.log.step(`Checking for a newer Plum release… (you have ${fromVersion})`);

	const latest = fetchLatestPublishedVersion();
	if (latest && latest === fromVersion) {
		clack.outro(pc.green(`Already on the latest version (${fromVersion}). Nothing to do.`));
		return;
	}

	if (!(await npmInstallLatestWithRetry())) {
		clack.log.error(
			`Failed to install the latest version after ${NPM_INSTALL_RETRIES} attempts. Try again shortly, or run "npm install -g plum-e2e@latest" manually to see the full error.`
		);
		clack.outro(pc.red('Update failed.'));
		process.exitCode = 1;
		return;
	}

	// Re-read from disk (not require-cached) so this reflects what npm just installed.
	const toVersion = readPlumVersion();
	clack.log.success(`Plum CLI updated: ${fromVersion} → ${toVersion}`);

	// Servers register their directory here when configured; nodes live in the
	// named store (~/.plum/nodes/). Both are found regardless of cwd.
	const { getInstalls } = globalRegistryLib();
	const { listNodeNames } = nodeRegisterLib();
	migrateLegacyNodes();

	let restartedAnything = false;

	// Re-exec `plum` as a fresh process (cwd set to each install dir) for the
	// restart steps rather than calling serverRestart()/nodeRestart() directly —
	// this same process already loaded the OLD code into memory before npm
	// install ran above, so calling them in-process would rebuild using stale
	// logic no matter how new the just-installed files on disk actually are.
	for (const dir of getInstalls('server')) {
		if (!fs.existsSync(path.join(dir, '.plum-server.json'))) continue;

		// This registry is global to the machine, not scoped to the directory
		// `plum update` was run from — an unrelated project on the same machine
		// as a registered server would otherwise silently boot that server's
		// Docker stack. Ask first whenever there's someone to ask; a
		// non-interactive run (CI, cron, systemd) has no one to ask and keeps
		// the previous unconditional behavior.
		if (interactiveAllowed()) {
			const proceed = await clack.confirm({
				message: `Found a registered server at ${dir} — restart it?`,
				initialValue: true
			});
			if (clack.isCancel(proceed)) cancelAndExit();
			if (!proceed) continue;
		}

		clack.log.step(`Rebuilding server at ${dir}…`);
		try {
			execSync('plum server restart', { stdio: 'inherit', cwd: dir });
			restartedAnything = true;
		} catch (e) {
			clack.log.warn(`Could not restart server at ${dir}: ${e.message}`);
		}
	}

	for (const nodeName of listNodeNames()) {
		if (interactiveAllowed()) {
			const proceed = await clack.confirm({
				message: `Restart node "${nodeName}"?`,
				initialValue: true
			});
			if (clack.isCancel(proceed)) cancelAndExit();
			if (!proceed) continue;
		}

		// Always attempt the restart rather than gating on the local PID
		// registry: that registry goes stale and skipping the restart silently
		// leaves the OLD node process running mismatched code — it still answers
		// /api/ping so it looks "online" while actually being unreachable.
		clack.log.step(`Restarting node "${nodeName}"…`);
		try {
			execSync(`plum node restart ${nodeName}`, { stdio: 'inherit' });
			restartedAnything = true;
		} catch (e) {
			clack.log.warn(`Could not restart node "${nodeName}": ${e.message}`);
		}
	}

	if (!restartedAnything) {
		clack.log.info(
			'No running server or node found — run `plum server start` or `plum node start` when ready.'
		);
	}

	clack.outro(pc.green(`Plum updated: ${fromVersion} → ${toVersion}`));
}

async function serverReconfig() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Reconfigure Server  ')));
	const cfg = await configureServer({ force: true });
	applyServerConfig(cfg);
	clack.log.success("Saved. Run 'plum server start' to apply.");
	clack.outro(`UI: ${pc.cyan(cfg.uiUrl)}`);
}

/* -----------------------------------------------------
 *                 Node flow
 * ------------------------------------------------------ */

// `plum node <sub> <name>` — the first positional after the subcommand.
function nodeNameArg() {
	const a = process.argv[4];
	return a && !a.startsWith('-') ? a : null;
}

// Resolves which node a command targets: an explicit name, or the only one on
// this machine. Prints guidance and returns null when it can't decide.
function resolveNodeName(explicit) {
	if (explicit) return explicit;
	const names = nodeRegisterLib().listNodeNames();
	if (names.length === 1) return names[0];
	if (names.length === 0) {
		clack.log.warn('No nodes configured here yet — run `plum node start <name>`.');
	} else {
		clack.log.warn(`Name which node: ${names.map((n) => pc.cyan(n)).join('  ')}`);
	}
	return null;
}

// One-time: pull any legacy `.plum-node.json` (older `plum node start` wrote it
// into whatever directory it ran in) into ~/.plum/nodes/<name>/.
function migrateLegacyNodes() {
	const { migrateLegacyNodes: run } = nodeRegisterLib();
	const { getInstalls } = globalRegistryLib();
	const imported = run(getInstalls('node'));
	if (imported.length) {
		clack.log.info(`Imported node config: ${imported.join(', ')}`);
	}
}

async function configureNode({ force, name: nameArg }) {
	const { generateToken, detectLanIp, loadNodeByName, saveNodeByName, nodeHome } =
		nodeRegisterLib();
	const args = process.argv.slice(3);

	let name = nameArg ?? getFlag(args, '--name') ?? null;
	const interactive =
		force ||
		(interactiveAllowed() &&
			!name &&
			!anyFlags(args, ['--primary', '--url', '--port', '--token', '--browser']));

	// Name first — the saved config for that name seeds the other defaults.
	if (!name && interactive) {
		const v = await clack.text({
			message: 'Node name or alias — call it whatever you like',
			placeholder: 'node-1',
			defaultValue: 'node-1'
		});
		if (clack.isCancel(v)) cancelAndExit();
		name = v || 'node-1';
	}
	if (!name) name = `node-${generateToken().slice(0, 6)}`;

	const saved = loadNodeByName(name);

	let mode = getFlag(args, '--mode') ?? saved.mode ?? 'local';
	let primary = getFlag(args, '--primary') ?? process.env.PRIMARY_URL ?? saved.primary ?? '';
	// Not 3001 — that's the primary's default; a co-located node must not collide.
	let port = getFlag(args, '--port') ?? saved.port ?? '3002';
	let browser = getFlag(args, '--browser') ?? saved.browser ?? 'chromium';
	let token = getFlag(args, '--token') ?? process.env.NODE_TOKEN ?? saved.token ?? generateToken();
	let url = getFlag(args, '--url') ?? saved.url ?? '';

	if (interactive) {
		const modeVal = await clack.select({
			message: 'Is this node for a production / network setup, or this local machine?',
			options: [
				{ value: 'production', label: 'Production / Network' },
				{ value: 'local', label: 'Local machine' }
			],
			initialValue: mode === 'production' ? 'production' : 'local'
		});
		if (clack.isCancel(modeVal)) cancelAndExit();
		mode = modeVal;

		if (mode === 'production') {
			primary = await promptPublicUrl(
				'Plum server backend URL or IP address (include the port)',
				primary || 'https://plum.example.com'
			);
		} else {
			const bp = await clack.text({
				message:
					'Port your Plum backend runs on (default 3001 — if you changed it or are unsure, ' +
					'run `docker compose ps` or check Docker Desktop on the server machine)',
				placeholder: '3001',
				defaultValue: '3001'
			});
			if (clack.isCancel(bp)) cancelAndExit();
			primary = `http://localhost:${(bp || '3001').trim()}`;
		}

		const portVal = await clack.text({
			message:
				'Port this node will listen on — it runs there, and any process already using ' +
				'that port is stopped when the node starts',
			placeholder: port,
			defaultValue: port
		});
		if (clack.isCancel(portVal)) cancelAndExit();
		port = (portVal || port).trim();

		if (mode === 'production') {
			url = await promptPublicUrl(
				'URL your Plum server uses to reach this node (e.g. https://node-1.example.com)',
				url && !url.includes('host.docker.internal') ? url : 'https://node-1.example.com'
			);
		} else {
			// Local primary runs in Docker — it reaches a host node via
			// host.docker.internal, not localhost.
			url = `http://host.docker.internal:${port}`;
			clack.log.info(`This node will register with the server as ${pc.cyan(url)}`);
		}
	}

	// Flag path with no --url: fall back to the LAN-IP guess (interactive already set it).
	if (!url) url = `http://${detectLanIp()}:${port}`;

	if (!VALID_BROWSERS.includes(browser)) {
		clack.log.error(`Invalid browser "${browser}". Choose one of: ${VALID_BROWSERS.join(', ')}`);
		process.exit(1);
	}

	saveNodeByName(name, {
		id: saved.id ?? null,
		name,
		mode,
		url,
		token,
		primary,
		browser,
		port,
		pid: saved.pid ?? null
	});
	globalRegistryLib().registerInstall('node', nodeHome(name));
	return { primary, port, browser, token, name, url, mode };
}

async function registerNode({ primary, name, url, token, browser, port }) {
	const { registerWithPrimary, loadNodeByName, saveNodeByName } = nodeRegisterLib();
	let registeredId = null;

	if (primary) {
		const s = clack.spinner();
		s.start(`Registering "${name}" with primary at ${primary}...`);
		try {
			const { id, reused } = await registerWithPrimary({ primary, name, url, token, browser });
			registeredId = id;
			s.stop(
				pc.green(reused ? `✓ Updated "${name}" on primary` : `✓ Registered "${name}" on primary`)
			);
		} catch (e) {
			s.stop(pc.yellow(`Could not register with primary: ${e.message}`));
		}
	} else {
		clack.log.warn('No --primary given — the node is configured but not registered anywhere.');
	}

	saveNodeByName(name, {
		...loadNodeByName(name),
		id: registeredId,
		name,
		url,
		token,
		primary,
		browser,
		port
	});
	return registeredId;
}

// Register a node with the primary and start its process here — this is the one
// path both `plum node start` and manage-nodes' "Add new node" run.
async function bringNodeUp(cfg) {
	const { prepareEnv, startNode, findPidOnPort, killPort, nodeReachable } = runnerProcessLib();

	const registeredId = await registerNode(cfg);
	if (!registeredId) {
		clack.outro(pc.red('Node not started.'));
		process.exitCode = 1;
		return;
	}

	clack.log.step('Preparing environment (deps + browsers)...');
	try {
		prepareEnv();
	} catch (e) {
		clack.log.error(
			`Environment prep failed: ${e.message} — not starting (tests would fail at browser launch).`
		);
		clack.outro(pc.red('Node not started.'));
		process.exitCode = 1;
		return;
	}

	if (findPidOnPort(Number(cfg.port))) {
		clack.log.step(`Port ${cfg.port} is in use — freeing it...`);
		await killPort(Number(cfg.port));
	}

	const entry = startNode({ id: String(registeredId), port: cfg.port, token: cfg.token });
	clack.log.step(`Starting "${cfg.name}" on port ${cfg.port} (pid ${entry.pid})...`);
	const up = await nodeReachable(`http://localhost:${cfg.port}`, cfg.token, 15000);
	if (up) {
		clack.outro(
			pc.green(`Node "${cfg.name}" running (pid ${entry.pid}) — logs at ${entry.logFile}`)
		);
	} else {
		clack.log.error(
			pc.red(
				`Node "${cfg.name}" isn't answering on port ${cfg.port}. Check ${entry.logFile}. ` +
					`If ${cfg.url} is a proxy/domain, make sure it forwards here on ${cfg.port}.`
			)
		);
		process.exitCode = 1;
		clack.outro(pc.red('Node started but unverified.'));
	}
}

async function nodeStart({ reconfig, name }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node  ')));
	migrateLegacyNodes();
	const cfg = await configureNode({ force: reconfig, name });
	await bringNodeUp(cfg);
}

async function nodeRestart({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Restart  ')));
	migrateLegacyNodes();
	const { loadNodeByName } = nodeRegisterLib();
	const { prepareEnv, stopNode, startNode, killPort, nodeReachable } = runnerProcessLib();

	const target = resolveNodeName(nameArg);
	if (!target) return clack.outro(pc.dim('Done.'));
	const cfg = loadNodeByName(target);
	if (!cfg.id) {
		clack.outro(pc.yellow(`"${target}" isn't registered — run \`plum node start ${target}\`.`));
		return;
	}

	stopNode(String(cfg.id), Number(cfg.port));
	try {
		prepareEnv();
	} catch (e) {
		clack.log.error(`Dependency refresh failed: ${e.message}`);
		clack.outro(pc.red('Node not restarted.'));
		process.exitCode = 1;
		return;
	}

	await killPort(Number(cfg.port));
	const entry = startNode({ id: String(cfg.id), port: cfg.port, token: cfg.token });
	const up = await nodeReachable(`http://localhost:${cfg.port}`, cfg.token, 15000);
	if (up) {
		clack.outro(pc.green(`"${target}" restarted (pid ${entry.pid}).`));
	} else {
		clack.log.error(
			pc.red(`"${target}" didn't come back on port ${cfg.port} — check ${entry.logFile}.`)
		);
		process.exitCode = 1;
		clack.outro(pc.red('Restart unverified.'));
	}
}

async function nodeStop({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Stop  ')));
	migrateLegacyNodes();
	const { loadNodeByName } = nodeRegisterLib();
	const { stopNode, killPort } = runnerProcessLib();

	const target = resolveNodeName(nameArg);
	if (!target) return clack.outro(pc.dim('Done.'));
	const cfg = loadNodeByName(target);
	const stopped = stopNode(String(cfg.id ?? target), cfg.port ? Number(cfg.port) : null);
	if (cfg.port) await killPort(Number(cfg.port));
	clack.outro(stopped ? pc.green(`Stopped "${target}".`) : pc.dim(`"${target}" wasn't running.`));
}

async function nodeList() {
	migrateLegacyNodes();
	const { listNodeNames, loadNodeByName } = nodeRegisterLib();
	const { statusOf } = runnerProcessLib();
	const names = listNodeNames();
	if (names.length === 0) {
		clack.log.info('No nodes on this machine — add one with `plum node start <name>`.');
		return;
	}
	for (const n of names) {
		const c = loadNodeByName(n);
		const running = c.id && statusOf(String(c.id)) === 'running';
		console.log(
			`${running ? pc.green('●') : pc.dim('○')} ${n.padEnd(16)} ${pc.dim((c.url || '') + '  :' + (c.port || '?'))}`
		);
	}
}

async function nodeDelete({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Delete  ')));
	migrateLegacyNodes();
	const { loadNodeByName, deleteNodeByName, nodeHome } = nodeRegisterLib();
	const { stopNode, killPort } = runnerProcessLib();
	const { unregisterInstall } = globalRegistryLib();

	const target = nameArg || resolveNodeName(null);
	if (!target) return clack.outro(pc.dim('Done.'));
	const cfg = loadNodeByName(target);

	stopNode(String(cfg.id ?? target), cfg.port ? Number(cfg.port) : null);
	if (cfg.port) await killPort(Number(cfg.port));

	if (cfg.id && cfg.primary) {
		try {
			const res = await fetch(`${cfg.primary.replace(/\/$/, '')}/runners/${cfg.id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${cfg.token}` },
				signal: AbortSignal.timeout(10000)
			});
			clack.log[res.ok ? 'success' : 'warn'](
				res.ok ? 'Removed from primary.' : `Primary responded HTTP ${res.status}`
			);
		} catch (e) {
			clack.log.warn(`Could not reach primary: ${e.message}`);
		}
	}

	deleteNodeByName(target);
	unregisterInstall('node', nodeHome(target));
	clack.outro(pc.green(`Deleted "${target}" — process, local config, and primary registration.`));
}

async function nodeReconfig({ name }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Reconfigure Node  ')));
	migrateLegacyNodes();
	const cfg = await configureNode({ force: true, name });
	await registerNode(cfg);
	clack.outro(pc.dim(`Saved. Run \`plum node restart ${cfg.name}\` to apply.`));
}

// stop/restart/delete on the /runners API want a registered runner's token
// (runnerOrAdmin). On the primary host those tokens sit in the backend's DB —
// pull one straight from the running container so the menu can authenticate
// without a node's .plum-node.json in the current folder. Best-effort: on a
// node-only box (no server install / no Docker) this no-ops and the menu falls
// back to a local .plum-node.json.
function readRunnerTokenFromPrimary() {
	const { getInstalls } = globalRegistryLib();
	const script =
		"require('./services/prisma').runner.findFirst({select:{token:true}})" +
		".then(r=>{process.stdout.write(r&&r.token||'');process.exit(0)}).catch(()=>process.exit(1))";
	for (const dir of getInstalls('server')) {
		try {
			const token = execSync(`docker compose exec -T backend node -e "${script}"`, {
				cwd: dir,
				stdio: ['ignore', 'pipe', 'ignore'],
				timeout: 15000
			})
				.toString()
				.trim();
			if (token) return token;
		} catch {}
	}
	return null;
}

async function openManageNodesMenu(primaryUrl) {
	const manageScript = path.join(plumRoot, 'backend', 'scripts', 'manage-nodes.mjs');
	const apiUrl = primaryUrl || 'http://localhost:3001';
	const env = { ...process.env, PLUM_API_URL: apiUrl };
	if (!env.PLUM_RUNNER_TOKEN) {
		const token = readRunnerTokenFromPrimary();
		if (token) env.PLUM_RUNNER_TOKEN = token;
	}
	const menu = spawn(process.execPath, [manageScript], { stdio: 'inherit', env });
	await new Promise((resolve) => menu.on('exit', resolve));
}

/* -----------------------------------------------------
 *                    Commands
 *  Description:
 * 		Main command line interface for Plum. Use
 * 		"plum <command>" to run the desired command.
 * ------------------------------------------------------ */
switch (command) {
	case '--version':
	case '-v':
	case 'version': {
		const pkg = JSON.parse(fs.readFileSync(path.join(plumRoot, 'package.json'), 'utf8'));
		console.log(pkg.version);
		break;
	}

	case 'init': {
		clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Init  ')));

		// Test scaffold
		if (fs.existsSync(userTestsPath)) {
			clack.log.warn('`tests/` already exists — skipping scaffold.');
		} else {
			fse.copySync(scaffoldTestsPath, userTestsPath);
			clack.log.success('`tests/` created with example files.');
		}

		createEnvFile();
		ensureGitignore();
		scaffoldPluginsFile();

		// .vscode/settings.json
		{
			const vscodeSettingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
			if (!fs.existsSync(vscodeSettingsPath)) {
				fs.mkdirSync(path.dirname(vscodeSettingsPath), { recursive: true });
				fs.writeFileSync(
					vscodeSettingsPath,
					JSON.stringify(
						{
							'cucumber.glue': ['tests/step_definitions/**/*.ts'],
							'cucumber.features': ['tests/features/**/*.feature']
						},
						null,
						2
					) + '\n',
					'utf8'
				);
				clack.log.success('.vscode/settings.json created for Cucumber extension.');
			} else {
				clack.log.warn('.vscode/settings.json already exists — skipping.');
			}

			// VS Code Cucumber extension
			try {
				execSync('code --version', { stdio: 'ignore' });
				try {
					execSync('code --install-extension cucumberopen.cucumber-official', {
						stdio: 'ignore'
					});
					clack.log.success('Cucumber VS Code extension installed.');
				} catch {
					clack.log.warn(
						'Could not install VS Code extension automatically.\n  Install manually: cucumberopen.cucumber-official'
					);
				}
			} catch {
				clack.log.info('Install the Cucumber extension manually: cucumberopen.cucumber-official');
			}
		}

		// tsconfig.json
		{
			const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
			if (!fs.existsSync(tsconfigPath)) {
				const backendModules = path.join(plumRoot, 'backend', 'node_modules').replace(/\\/g, '/');
				const tsconfig = {
					compilerOptions: {
						target: 'ES2020',
						module: 'CommonJS',
						moduleResolution: 'node',
						esModuleInterop: true,
						strict: false,
						skipLibCheck: true,
						baseUrl: '.',
						paths: {
							playwright: [`${backendModules}/playwright`],
							'@playwright/test': [`${backendModules}/@playwright/test`],
							'@cucumber/cucumber': [`${backendModules}/@cucumber/cucumber`],
							dotenv: [`${backendModules}/dotenv`],
							chai: [`${backendModules}/chai`],
							'chai-soft-assert': [`${backendModules}/chai-soft-assert`]
						},
						typeRoots: [`${backendModules}/@types`]
					},
					include: ['tests/**/*.ts']
				};
				fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf8');
				clack.log.success('tsconfig.json created for IDE type resolution.');
			} else {
				clack.log.warn('tsconfig.json already exists — skipping.');
			}
		}

		// README.md
		{
			const userReadmePath = path.join(process.cwd(), 'README.md');
			if (!fs.existsSync(userReadmePath)) {
				const readmeContent = [
					'# My Tests',
					'',
					'Powered by [Plum](https://github.com/silverlunah/plum) — Playwright + Cucumber + Test Repository.',
					'',
					'## Getting Started',
					'',
					"Your project is ready. Here's what to do next:",
					'',
					"1. **Open `.env`** and set `BASE_URL` to your application's URL.",
					'2. **Run the example tests** to confirm everything works:',
					'   ```bash',
					'   plum run-test',
					'   ```',
					'3. **Write your first test** — scaffold a full feature or generate a single step:',
					'   ```bash',
					'   plum create-test   # scaffold .feature + Page.ts + Steps.ts',
					'   plum create-step   # add a single step to an existing file',
					'   ```',
					'4. **Start the full UI** (requires Docker) to trigger tests, view reports, and manage your test repository:',
					'   ```bash',
					'   plum start',
					'   ```',
					'   On first run, Plum asks you to create an admin account. Then open **http://localhost:3002** and sign in.',
					'',
					'---',
					'',
					'## Commands',
					'',
					'| Command | Description |',
					'| --- | --- |',
					'| `plum run-test` | Run all tests locally |',
					'| `plum run-test @tag` | Run tests matching a tag |',
					'| `plum run-test --parallel N` | Run tests across N parallel workers |',
					'| `plum run-test --browser firefox` | Run in a specific browser (chromium/firefox) |',
					'| `plum start` | Start the full UI via Docker (interactive setup) |',
					'| `plum server reconfig` | Change server URL/ports without starting |',
					'| `plum stop` | Stop the server |',
					'| `plum create-step` | Interactively generate a new step definition |',
					'| `plum node start <name>` | Register a node and start it here |',
					'| `plum node list` | List this machine’s nodes |',
					'',
					'---',
					'',
					'## Configuration',
					'',
					'| File | Purpose |',
					'| --- | --- |',
					'| `.env` | Set `BASE_URL` (your app) and `IS_HEADLESS` (`true`/`false`) |',
					'| `plum.plugins.json` | Add extra npm packages your tests need |',
					'',
					'---',
					'',
					'## Test Structure',
					'',
					'```',
					'tests/',
					'  features/          — Gherkin .feature files (write your scenarios here)',
					'  step_definitions/  — TypeScript step implementations',
					'  pages/             — Page Object Models',
					'  utils/             — Browser setup, hooks, shared helpers',
					'```',
					'',
					'Each scenario needs a unique tag so you can run it by itself:',
					'',
					'```gherkin',
					'@suite-login',
					'Feature: Login',
					'',
					'  @test-login-1',
					'  Scenario: User can log in with valid credentials',
					'    Given I am on the login page',
					'    When I enter valid credentials',
					'    Then I should see the dashboard',
					'```',
					'',
					'```bash',
					'plum run-test @test-login-1   # run a single scenario',
					'plum run-test @suite-login    # run the whole suite',
					'```',
					'',
					'---',
					'',
					'## Test Repository',
					'',
					'Plum includes a built-in test case management system. Access it from the **Test Repository** tab in the UI.',
					'',
					'- **Test Suites** — Group related test cases. Each suite gets an auto-assigned ID (e.g. `TS-001`).',
					'- **Test Cases** — Document steps (Action / Test Data / Expected Output), set priority, and assign a Cucumber `@tag` to link automation.',
					'- **Test Runs** — Build a run from any combination of cases, execute them one by one (pass/fail/blocked/skip), and track history.',
					'- **Auto-linking** — When a build completes, Plum matches Cucumber scenario tags against `automatedTag` values on your test cases and marks them as automated.',
					'- **Export / import** — Export test cases (whole repository or one suite) as CSV or JSON from the Suites tab. The JSON re-imports from **Settings → Test Cases** — a case whose ID already exists is skipped; anything else is imported with a fresh ID.',
					'',
					'To link a test case to automation, set its **Automated tag** (e.g. `test-login-1`) to match the `@tag` on the Cucumber scenario.',
					'',
					'---',
					'',
					'## Cucumber & Gherkin Resources',
					'',
					'New to Cucumber? These links will get you up to speed quickly:',
					'',
					'- [Gherkin syntax reference](https://cucumber.io/docs/gherkin/reference/) — Feature files, Scenarios, Given/When/Then, tags, Scenario Outlines',
					'- [Step definitions guide](https://cucumber.io/docs/cucumber/step-definitions/) — Connecting Gherkin steps to TypeScript code',
					'- [Playwright docs](https://playwright.dev/docs/intro) — Browser automation API used inside page objects',
					'- [Plum documentation](https://github.com/silverlunah/plum) — Full README and reference'
				].join('\n');
				fs.writeFileSync(userReadmePath, readmeContent + '\n', 'utf8');
				clack.log.success('README.md created.');
			} else {
				clack.log.warn('README.md already exists — skipping.');
			}
		}

		// Install dependencies
		clack.log.step('Installing dependencies (npm run init)...');
		execSync('npm run init', { cwd: plumRoot, stdio: 'inherit' });

		clack.note(
			[
				`Tests scaffold  ${pc.dim('→')}  ${pc.cyan('tests/')}`,
				`Extra packages  ${pc.dim('→')}  ${pc.cyan('plum.plugins.json')}`,
				`App URL config  ${pc.dim('→')}  ${pc.cyan('.env')}`,
				'',
				`${pc.bold('Run tests locally')}`,
				`  ${pc.cyan('plum run-test')}            run all tests`,
				`  ${pc.cyan('plum run-test @tag')}       run by tag`,
				'',
				`${pc.bold('Start the full UI')}  ${pc.dim('(requires Docker)')}`,
				`  ${pc.cyan('plum server start')}`,
				'',
				`${pc.bold('Generate tests')}`,
				`  ${pc.cyan('plum create-test')}         scaffold a new feature`,
				`  ${pc.cyan('plum create-step')}         add a step definition`
			].join('\n'),
			'Next steps'
		);
		clack.outro(pc.magenta('Plum is ready.'));
		break;
	}

	case 'server':
		if (subcommand === 'stop') {
			console.log('--------------------------------------\n');
			console.log('🛑 Stopping Plum server...');
			execSync('docker compose down', { cwd: plumRoot, stdio: 'inherit' });
			console.log('✅ Plum server stopped. Your data is preserved.\n');
			console.log('--------------------------------------\n');
			break;
		}
		if (subcommand === 'reconfig') {
			await serverReconfig();
			break;
		}
		if (subcommand === 'restart') {
			await serverRestart();
			break;
		}
		if (subcommand === 'update') {
			await serverUpdate();
			break;
		}
		await serverStart();
		break;

	case 'start':
		console.log(
			`\nSpecify what to start:\n  ${pc.cyan('plum server start')}   — start the web UI stack (Docker)\n  ${pc.cyan('plum node start')}     — start a node\n`
		);
		process.exit(1);
		break;

	case 'restart':
		console.log(
			`\nSpecify what to restart:\n  ${pc.cyan('plum server restart')}  — rebuild and restart the server\n  ${pc.cyan('plum node restart')}    — restart the node\n`
		);
		process.exit(1);
		break;

	case 'update':
		await serverUpdate();
		break;

	case 'run-test': {
		const runHelpArgs = process.argv.slice(3);
		if (anyFlags(runHelpArgs, ['--help', '-h'])) {
			console.log(
				[
					'',
					`${pc.bold('Usage:')} plum run-test [tag] [options]`,
					'',
					`  ${pc.cyan('plum run-test')}                    run all tests`,
					`  ${pc.cyan('plum run-test @tag')}               run tests matching a tag`,
					`  ${pc.cyan('plum run-test --parallel N')}       run tests across N parallel workers`,
					`  ${pc.cyan('plum run-test --browser firefox')}  run in a specific browser (chromium/firefox)`,
					''
				].join('\n')
			);
			break;
		}

		console.log('--------------------------------------\n');
		console.log('🚀 Running tests locally...');

		// Copy .env file from root to backend
		copyEnvFile();

		const runArgs = process.argv.slice(3);
		const parallelIdx = runArgs.indexOf('--parallel');
		const parallelArg = parallelIdx !== -1 ? runArgs[parallelIdx + 1] : null;
		const browserIdx = runArgs.indexOf('--browser');
		const browserArg = browserIdx !== -1 ? runArgs[browserIdx + 1] : null;
		const tagArg = runArgs.find((a) => a.startsWith('@')) ?? null;
		const userTestsPath = path.resolve(process.cwd(), 'tests');
		const backendTestsPath = path.join(plumRoot, 'backend', 'tests');

		if (browserArg && !VALID_BROWSERS.includes(browserArg)) {
			console.error(
				`✗ Invalid browser "${browserArg}". Choose one of: ${VALID_BROWSERS.join(', ')}`
			);
			process.exit(1);
		}

		// Copy user tests into backend
		if (fs.existsSync(userTestsPath)) {
			console.log('📦 Syncing your tests...\n');
			fse.copySync(userTestsPath, backendTestsPath);
		} else {
			console.log('⚠️  No `tests/` folder found in the user directory.\n');
		}

		// Run npm install
		console.log('--------------------------------------\n');
		console.log('Running `npm install`...');

		execSync('npm install', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit'
		});

		// Install user-defined plugins from plum.plugins.json
		installPlugins();

		console.log('Running `npx playwright install chromium firefox`...');

		execSync('npx playwright install chromium firefox', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit'
		});

		// Run the tests with the tag filter, only if a tag is provided
		console.log('--------------------------------------\n');
		console.log('Running `npm run test` with:');
		console.log('TAG =', tagArg ?? '');
		console.log('PARALLEL =', parallelArg ?? 'off');
		console.log('BROWSER =', browserArg ?? 'chromium');
		console.log('TRIGGER =', 'command-line-trigger');

		execSync('npm run test', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit',
			env: {
				...process.env,
				TAG: tagArg ?? '',
				TRIGGER: 'command-line-trigger',
				...(parallelArg ? { PARALLEL: parallelArg } : {}),
				...(browserArg ? { BROWSER: browserArg } : {})
			}
		});
		console.log('--------------------------------------\n');
		break;
	}

	case 'stop':
		console.log(
			`\nSpecify what to stop:\n  ${pc.cyan('plum server stop')}    — stop the web UI stack\n  ${pc.cyan('plum node stop')}      — stop the node\n`
		);
		process.exit(1);
		break;

	case 'node': {
		const nodeName = nodeNameArg();
		if (subcommand === '-h' || subcommand === '--help') {
			console.log(
				[
					'',
					`${pc.bold('Usage:')} plum node <command> [name] [options]`,
					'',
					'  start [name]     register a node with the primary and start it here',
					'  list             list this machine’s nodes and their status',
					'  restart [name]   stop, refresh deps, restart a node',
					'  stop [name]      stop a node',
					'  delete <name>    stop it, delete its config, unregister it from the primary',
					'  reconfig [name]  re-enter settings and re-register, without starting',
					'',
					'  Options for start: --mode <local|production> --primary <url> --url <url> --port <n> --token <s> --browser <chromium|firefox>',
					''
				].join('\n')
			);
			break;
		}
		if (subcommand === 'stop') {
			await nodeStop({ name: nodeName });
			break;
		}
		if (subcommand === 'restart') {
			await nodeRestart({ name: nodeName });
			break;
		}
		if (subcommand === 'reconfig') {
			await nodeReconfig({ name: nodeName });
			break;
		}
		if (subcommand === 'list' || subcommand === 'ls') {
			await nodeList();
			break;
		}
		if (subcommand === 'delete' || subcommand === 'rm') {
			await nodeDelete({ name: nodeName });
			break;
		}
		// `plum node start [name]` or bare `plum node` or `plum node <name>`
		await nodeStart({
			reconfig: false,
			name:
				subcommand === 'start'
					? nodeName
					: subcommand && !subcommand.startsWith('-')
						? subcommand
						: null
		});
		break;
	}

	case 'manage-nodes': {
		const { listNodeNames, loadNodeByName } = nodeRegisterLib();
		const firstNode = listNodeNames()
			.map(loadNodeByName)
			.find((c) => c.primary);
		const primaryUrl =
			getFlag(process.argv.slice(3), '--primary') ??
			process.env.PLUM_API_URL ??
			firstNode?.primary ??
			'http://localhost:3001';
		await openManageNodesMenu(primaryUrl);
		break;
	}

	case 'create-step': {
		const createStepScript = path.join(plumRoot, 'backend', 'config', 'scripts', 'create-step.mjs');
		execSync(`node "${createStepScript}"`, {
			cwd: process.cwd(),
			stdio: 'inherit',
			env: {
				...process.env,
				TESTS_ROOT: userTestsPath
			}
		});
		break;
	}

	case 'create-test': {
		const createTestScript = path.join(plumRoot, 'backend', 'config', 'scripts', 'create-test.mjs');
		execSync(`node "${createTestScript}"`, {
			cwd: process.cwd(),
			stdio: 'inherit',
			env: {
				...process.env,
				TESTS_ROOT: userTestsPath
			}
		});
		break;
	}

	default:
		console.log('--------------------------------------\n');
		console.log('Usage: plum <command>\n');
		console.log('  --version, -v        Print the installed Plum version');
		console.log('  init                 Set up a new Plum project');
		console.log('  server start         Start the full UI stack (interactive)');
		console.log('    --headless <bool>  Run browsers headless (true/false)');
		console.log('    --mode <m>         local | production (default: local)');
		console.log('    --backend-port <n> Host port for the backend/API (default: 3001)');
		console.log('    --frontend-port <n> Host port for the UI (default: 3002)');
		console.log(
			'    --api-url <url>    Public URL for the API (only if reverse-proxying; default: http://localhost:<backend-port>)'
		);
		console.log(
			'    --ui-url <url>     Public URL for the UI (only if reverse-proxying; default: http://localhost:<frontend-port>)'
		);
		console.log('  server restart       Rebuild Docker images and restart the server (no prompts)');
		console.log('  server stop          Stop the server (data preserved)');
		console.log('  server reconfig      Re-enter server settings without starting');
		console.log(
			'  update               Update Plum and restart whichever is running (server/node)'
		);
		console.log('  node start [name]    Register a node with the primary and start it here');
		console.log('    --mode <m>         local | production (default: local)');
		console.log('    --primary <url>    Primary Plum server to register with');
		console.log('    --url <url>        Address the primary calls back (default, local mode:');
		console.log(
			'                       http://host.docker.internal:<port>; production: pass a domain)'
		);
		console.log('    --port <n>         Local HTTP port the node listens on (default: 3002)');
		console.log('    --token <secret>   Auth token (auto-generated + saved if omitted)');
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('  node list            List this machine’s nodes and their status');
		console.log('  node restart [name]  Stop, refresh deps, and restart a node');
		console.log('  node stop [name]     Stop a node');
		console.log(
			'  node delete <name>   Stop it, remove its config, and unregister it from the primary'
		);
		console.log(
			'  node reconfig [name] Re-enter a node’s settings and re-register, without starting'
		);
		console.log('  manage-nodes         Open the node management menu');
		console.log(
			'    --primary <url>    Primary server URL (default: saved config or localhost:3001)'
		);
		console.log('  run-test             Run tests locally without Docker');
		console.log('    @tag               Run only tests matching a tag');
		console.log('    --parallel <n>     Run across n parallel workers');
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('  create-step          Interactively scaffold a new step definition');
		console.log('  create-test          Scaffold a new .feature + Page.ts + Steps.ts');
		console.log('\n--------------------------------------\n');
}
