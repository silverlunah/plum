#!/usr/bin/env node
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
		backendPort: getFlag(args, '--backend-port'),
		frontendPort: getFlag(args, '--frontend-port')
	};
	if (overrides.headless !== undefined) cfg.headless = overrides.headless === 'true';
	if (overrides.backendPort !== undefined) cfg.backendPort = overrides.backendPort;
	if (overrides.frontendPort !== undefined) cfg.frontendPort = overrides.frontendPort;

	const hasFlags = anyFlags(args, ['--headless', '--backend-port', '--frontend-port']);
	const interactive = force || (interactiveAllowed() && !hasFlags);

	if (interactive) {
		const headless = await clack.confirm({
			message: 'Run browsers headless?',
			initialValue: cfg.headless
		});
		if (clack.isCancel(headless)) cancelAndExit();
		cfg.headless = headless;

		const backendPort = await clack.text({
			message: 'Backend port',
			placeholder: String(cfg.backendPort),
			defaultValue: String(cfg.backendPort)
		});
		if (clack.isCancel(backendPort)) cancelAndExit();
		cfg.backendPort = backendPort || cfg.backendPort;

		const frontendPort = await clack.text({
			message: 'Frontend (UI) port',
			placeholder: String(cfg.frontendPort),
			defaultValue: String(cfg.frontendPort)
		});
		if (clack.isCancel(frontendPort)) cancelAndExit();
		cfg.frontendPort = frontendPort || cfg.frontendPort;
	}

	saveServerConfig(cwd, cfg);
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
			frontendPort: cfg.frontendPort
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

async function waitForServerReady(apiBase) {
	const s = clack.spinner();
	s.start('Waiting for server to be ready…');
	let ready = false;
	for (let i = 0; i < READY_POLL_MAX_ATTEMPTS; i++) {
		await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
		try {
			const res = await fetch(`${apiBase}/auth/needs-setup`);
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

async function runFirstUserSetup(apiBase, frontendPort) {
	let needsSetup = false;
	try {
		const res = await fetch(`${apiBase}/auth/needs-setup`);
		const data = await res.json();
		needsSetup = data.needsSetup;
	} catch {}

	if (!needsSetup) return;

	if (!interactiveAllowed()) {
		clack.log.info(
			`No users found. Open ${pc.cyan(`http://localhost:${frontendPort}/setup`)} to create your first account.`
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
		const res = await fetch(`${apiBase}/auth/setup`, {
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

// docker compose failures (port conflicts, daemon not running, etc.) must not
// crash the process with a raw stack trace — that would abort serverStart()
// before it ever reaches the first-user prompt, with no indication why.
function runDockerComposeUp(cfg) {
	try {
		execSync('docker compose up --build -d', { cwd: plumRoot, stdio: 'inherit' });
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
	clack.log.info(`UI: ${pc.cyan(`http://localhost:${cfg.frontendPort}`)}`);

	if (!runDockerComposeUp(cfg)) {
		clack.outro(pc.red('Plum did not start.'));
		process.exitCode = 1;
		return;
	}

	const apiBase = `http://127.0.0.1:${cfg.backendPort}`;
	const ready = await waitForServerReady(apiBase);

	if (ready) {
		await runFirstUserSetup(apiBase, cfg.frontendPort);
	} else {
		clack.log.warn(
			`Could not confirm the backend is ready. Check ${pc.cyan('docker compose logs -f backend')}.\n` +
				`Once it responds, open ${pc.cyan(`http://localhost:${cfg.frontendPort}/setup`)} to create your first account (if this is a fresh install).`
		);
	}

	clack.log.info(`UI:  ${pc.cyan(`http://localhost:${cfg.frontendPort}`)}`);
	clack.log.info(`API: ${pc.cyan(`http://localhost:${cfg.backendPort}`)}`);
	clack.outro(pc.green('Plum is running. Use "plum server stop" to shut down.'));
}

async function serverRestart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Server Restart  ')));
	const { loadServerConfig } = serverConfigLib();
	const cfg = loadServerConfig(process.cwd());
	applyServerConfig(cfg);
	clack.log.info(`UI: ${pc.cyan(`http://localhost:${cfg.frontendPort}`)}`);

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
	clack.log.info(`UI:  ${pc.cyan(`http://localhost:${cfg.frontendPort}`)}`);
	clack.log.info(`API: ${pc.cyan(`http://localhost:${cfg.backendPort}`)}`);
	clack.outro(pc.green('Server restarted.'));
}

async function serverUpdate() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Update  ')));
	clack.log.step('Fetching latest Plum version…');
	execSync('npm install -g plum-e2e@latest', { stdio: 'inherit' });
	clack.log.success('Plum CLI updated.');

	const serverCfgPath = path.join(process.cwd(), '.plum-server.json');
	const hasServerCfg = fs.existsSync(serverCfgPath);

	const { loadNodeConfig } = nodeRegisterLib();
	const { loadRegistry, isAlive } = runnerProcessLib();
	const nodeCfg = loadNodeConfig(process.cwd());
	const registry = loadRegistry();
	const nodeRunning = !!(
		nodeCfg.id &&
		registry[String(nodeCfg.id)]?.pid &&
		isAlive(registry[String(nodeCfg.id)].pid)
	);

	if (hasServerCfg) {
		clack.log.step('Rebuilding server with new version…');
		await serverRestart();
	}

	if (nodeRunning) {
		clack.log.step('Restarting node runner with new version…');
		await nodeRestart();
	}

	if (!hasServerCfg && !nodeRunning) {
		clack.outro(pc.green('Plum updated. Run `plum server start` or `plum node start` to launch.'));
	}
}

async function serverReconfig() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Reconfigure Server  ')));
	const cfg = await configureServer({ force: true });
	applyServerConfig(cfg);
	clack.log.success("Saved. Run 'plum server start' to apply.");
	clack.outro(`UI: ${pc.cyan(`http://localhost:${cfg.frontendPort}`)}`);
}

/* -----------------------------------------------------
 *                 Node flow
 * ------------------------------------------------------ */

async function configureNode({ force }) {
	const { generateToken, detectLanIp, loadNodeConfig, saveNodeConfig } = nodeRegisterLib();
	const cwd = process.cwd();
	const args = process.argv.slice(3);
	const saved = loadNodeConfig(cwd);

	let primary = getFlag(args, '--primary') ?? process.env.PRIMARY_URL ?? saved.primary ?? '';
	let port = getFlag(args, '--port') ?? saved.port ?? '3001';
	let browser = getFlag(args, '--browser') ?? saved.browser ?? 'chromium';
	let token = getFlag(args, '--token') ?? process.env.NODE_TOKEN ?? saved.token ?? generateToken();
	let name = getFlag(args, '--name') ?? saved.name ?? `node-${token.slice(0, 6)}`;
	// A provided --url is advertised verbatim; otherwise fall back to host:port.
	let url = getFlag(args, '--url') ?? saved.url ?? '';

	const hasFlags = anyFlags(args, [
		'--primary',
		'--url',
		'--port',
		'--token',
		'--name',
		'--browser'
	]);
	const interactive = force || (interactiveAllowed() && !hasFlags);

	if (interactive) {
		const primaryVal = await clack.text({
			message: 'Your Plum server backend URL',
			placeholder: primary || 'http://localhost:3001',
			defaultValue: primary
		});
		if (clack.isCancel(primaryVal)) cancelAndExit();
		primary = primaryVal || primary;

		const portVal = await clack.text({
			message: 'Local port this Plum node listens on',
			placeholder: port,
			defaultValue: port
		});
		if (clack.isCancel(portVal)) cancelAndExit();
		port = portVal || port;

		const defaultUrl = url || `http://${detectLanIp()}:${port}`;
		const urlVal = await clack.text({
			message: 'The URL your Plum server calls to communicate with this node',
			placeholder: defaultUrl,
			defaultValue: defaultUrl
		});
		if (clack.isCancel(urlVal)) cancelAndExit();
		url = urlVal || defaultUrl;
	}

	if (!url) url = `http://${detectLanIp()}:${port}`;

	if (!VALID_BROWSERS.includes(browser)) {
		clack.log.error(`Invalid browser "${browser}". Choose one of: ${VALID_BROWSERS.join(', ')}`);
		process.exit(1);
	}

	saveNodeConfig(cwd, {
		id: saved.id ?? null,
		name,
		url,
		token,
		primary,
		browser,
		port,
		pid: saved.pid ?? null
	});
	return { primary, port, browser, token, name, url };
}

async function registerNode({ primary, name, url, token, browser, port }) {
	const { registerWithPrimary, loadNodeConfig, saveNodeConfig } = nodeRegisterLib();
	let registeredId = null;

	if (primary) {
		const s = clack.spinner();
		s.start(`Registering with primary at ${primary}...`);
		try {
			const { id, reused } = await registerWithPrimary({ primary, name, url, token, browser });
			registeredId = id;
			s.stop(pc.green(reused ? '✓ Reusing existing runner on primary' : '✓ Registered on primary'));
		} catch (e) {
			s.stop(pc.yellow(`Could not register with primary: ${e.message}`));
			clack.log.warn('Add this runner manually using the details below.');
		}
	} else {
		clack.log.info('No primary set — add this runner manually on your Plum server.');
	}

	clack.note(
		[
			registeredId ? `id:      ${registeredId}` : 'id:      (assigned when added on the server)',
			`name:    ${name}`,
			`url:     ${url}`,
			`token:   ${token}`,
			`browser: ${browser}`
		].join('\n'),
		'Runner details'
	);

	clack.log.info(
		`The url above must be reachable from the primary. The local port (${port}) is only what this node listens on — forward your proxy/domain to it.`
	);

	const cwd = process.cwd();
	saveNodeConfig(cwd, {
		...loadNodeConfig(cwd),
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

async function nodeStart({ reconfig }) {
	const backendDir = path.join(plumRoot, 'backend');
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Runner  ')));

	const cfg = await configureNode({ force: reconfig });
	const registeredId = await registerNode(cfg);

	const { prepareEnv, startNode: startNodeProc } = runnerProcessLib();

	clack.log.step('Preparing environment (deps + browsers)...');
	try {
		prepareEnv();
		clack.log.success('Environment ready.');
	} catch (e) {
		clack.log.warn(`Environment prep failed: ${e.message}`);
	}

	if (registeredId) {
		try {
			const entry = startNodeProc({ id: String(registeredId), port: cfg.port, token: cfg.token });
			clack.log.success(
				pc.green(
					`Node "${cfg.name}" running in background (pid ${entry.pid}) — logs at backend/logs/runner-${registeredId}.log`
				)
			);
		} catch (e) {
			clack.log.warn(`Could not start runner process: ${e.message}`);
		}
	} else {
		clack.log.info('Runner not registered on primary — use the menu below to add and start it.');
	}

	await openManageRunnersMenu(cfg.primary);
	clack.outro(`Manage runners anytime: ${pc.cyan('plum manage-runners')}`);
}

async function nodeRestart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Restart  ')));
	const { loadNodeConfig } = nodeRegisterLib();
	const { prepareEnv, stopNode, startNode } = runnerProcessLib();
	const cfg = loadNodeConfig(process.cwd());

	if (!cfg.id) {
		clack.log.warn('No node configured in this folder — run `plum node start` first.');
		clack.outro(pc.dim('Done.'));
		return;
	}

	const stopped = stopNode(String(cfg.id));
	if (stopped) {
		clack.log.success(`Stopped runner "${cfg.name ?? cfg.id}".`);
	} else {
		clack.log.info('Node was not running — starting fresh.');
	}

	clack.log.step('Refreshing dependencies…');
	try {
		prepareEnv();
	} catch (e) {
		clack.log.warn(`Dependency refresh failed: ${e.message}`);
	}

	try {
		const entry = startNode({ id: String(cfg.id), port: cfg.port, token: cfg.token });
		clack.log.success(
			pc.green(
				`Node "${cfg.name}" restarted (pid ${entry.pid}) — logs at backend/logs/runner-${cfg.id}.log`
			)
		);
	} catch (e) {
		clack.log.warn(`Could not restart node: ${e.message}`);
	}

	clack.outro(pc.green('Node restarted.'));
}

async function nodeReconfig() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Reconfigure Node  ')));
	const cfg = await configureNode({ force: true });
	await registerNode(cfg);
	clack.log.success("Saved. Run 'plum node start' to launch this node.");
	clack.outro(pc.dim('Done.'));
}

async function openManageRunnersMenu(primaryUrl) {
	const manageScript = path.join(plumRoot, 'backend', 'scripts', 'manage-runners.mjs');
	const apiUrl = primaryUrl || 'http://localhost:3001';
	const menu = spawn(process.execPath, [manageScript], {
		stdio: 'inherit',
		env: { ...process.env, PLUM_API_URL: apiUrl }
	});
	await new Promise((resolve) => menu.on('exit', resolve));
}

/* -----------------------------------------------------
 *                    Commands
 *  Description:
 * 		Main command line interface for Plum. Use
 * 		"plum <command>" to run the desired command.
 * ------------------------------------------------------ */
switch (command) {
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
					'   On first run, Plum asks you to create an admin account. Then open **http://localhost:5173** and sign in.',
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
					'| `plum node start` | Start a runner node and auto-register it with the server |',
					'| `plum node stop` | Stop the runner node started from this folder |',
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
			`\nSpecify what to start:\n  ${pc.cyan('plum server start')}   — start the web UI stack (Docker)\n  ${pc.cyan('plum node start')}     — start a runner node\n`
		);
		process.exit(1);
		break;

	case 'restart':
		console.log(
			`\nSpecify what to restart:\n  ${pc.cyan('plum server restart')}  — rebuild and restart the server\n  ${pc.cyan('plum node restart')}    — restart the runner node\n`
		);
		process.exit(1);
		break;

	case 'update':
		await serverUpdate();
		break;

	case 'run-test': {
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
			`\nSpecify what to stop:\n  ${pc.cyan('plum server stop')}    — stop the web UI stack\n  ${pc.cyan('plum node stop')}      — stop the runner node\n`
		);
		process.exit(1);
		break;

	case 'node': {
		if (subcommand === 'stop') {
			clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Node Runner  ')));
			const { loadNodeConfig, saveNodeConfig } = nodeRegisterLib();
			const { stopNode } = runnerProcessLib();
			const cfg = loadNodeConfig(process.cwd());

			if (cfg.id) {
				const stopped = stopNode(String(cfg.id));
				if (stopped) {
					clack.log.success(`Stopped runner "${cfg.name ?? cfg.id}".`);
				} else if (cfg.pid) {
					try {
						process.kill(cfg.pid, 'SIGTERM');
						clack.log.success(`Stopped node process (pid ${cfg.pid}).`);
						saveNodeConfig(process.cwd(), { ...cfg, pid: null });
					} catch {
						clack.log.info('No running process found — it may already be stopped.');
					}
				} else {
					clack.log.info('No running process found — it may already be stopped.');
				}
			} else if (cfg.pid) {
				try {
					process.kill(cfg.pid, 'SIGTERM');
					clack.log.success(`Stopped node process (pid ${cfg.pid}).`);
					saveNodeConfig(process.cwd(), { ...cfg, pid: null });
				} catch {
					clack.log.info('No running process found — it may already be stopped.');
				}
			} else {
				clack.log.info('No node started from this folder.');
				clack.log.info(`Use ${pc.cyan('plum manage-runners')} to stop running nodes.`);
			}
			clack.outro(pc.dim('Done.'));
			break;
		}

		if (subcommand === 'restart') {
			await nodeRestart();
			break;
		}

		if (subcommand === 'reconfig') {
			await nodeReconfig();
			break;
		}

		await nodeStart({ reconfig: false });
		break;
	}

	case 'manage-runners': {
		const { loadNodeConfig } = nodeRegisterLib();
		const saved = loadNodeConfig(process.cwd());
		const primaryUrl =
			getFlag(process.argv.slice(3), '--primary') ??
			process.env.PLUM_API_URL ??
			saved.primary ??
			'http://localhost:3001';
		await openManageRunnersMenu(primaryUrl);
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

	case 'mcp': {
		const mcpScript = path.join(plumRoot, 'backend', 'mcp', 'server.js');
		spawn(process.execPath, [mcpScript], {
			stdio: 'inherit',
			env: {
				...process.env,
				PLUM_API_URL: process.env.PLUM_API_URL || 'http://localhost:3001',
				PLUM_API_KEY: process.env.PLUM_API_KEY || ''
			}
		});
		break;
	}

	default:
		console.log('--------------------------------------\n');
		console.log('Usage: plum <command>\n');
		console.log('  init                 Set up a new Plum project');
		console.log('  server start         Start the full UI stack (interactive)');
		console.log('    --headless <bool>  Run browsers headless (true/false)');
		console.log('    --backend-port <n> Host port for the backend/API (default: 3001)');
		console.log('    --frontend-port <n> Host port for the UI (default: 5173)');
		console.log('  server restart       Rebuild Docker images and restart the server (no prompts)');
		console.log('  server stop          Stop the server (data preserved)');
		console.log('  server reconfig      Re-enter server settings without starting');
		console.log(
			'  update               Update Plum and restart whichever is running (server/node)'
		);
		console.log('  node start           Start a runner node (interactive), then open runner menu');
		console.log('    --primary <url>    Primary Plum server to auto-register with');
		console.log('    --url <url>        Address the primary calls back (default: <lan-ip>:<port>;');
		console.log(
			'                       pass a domain like https://node1.example behind a TLS proxy)'
		);
		console.log('    --port <n>         Local HTTP port the node listens on (default: 3001)');
		console.log('    --token <secret>   Auth token (auto-generated + saved if omitted)');
		console.log('    --name <name>      Runner name shown on the primary (default: node-<rand>)');
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('  node restart         Stop, refresh deps, and restart the node runner');
		console.log('  node reconfig        Re-enter node settings + re-register, without starting');
		console.log('  node stop            Stop the runner node started from this folder');
		console.log('  manage-runners       Open the runner management menu');
		console.log(
			'    --primary <url>    Primary server URL (default: saved config or localhost:3001)'
		);
		console.log('  run-test             Run tests locally without Docker');
		console.log('    @tag               Run only tests matching a tag');
		console.log('    --parallel <n>     Run across n parallel workers');
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('  create-step          Interactively scaffold a new step definition');
		console.log('  create-test          Scaffold a new .feature + Page.ts + Steps.ts');
		console.log('  mcp                  Start the Plum MCP server (stdio) for Claude integration');
		console.log('\n--------------------------------------\n');
}
