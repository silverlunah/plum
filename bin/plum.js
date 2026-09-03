#!/usr/bin/env node
/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { execSync, execFileSync, spawn } from 'child_process';
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
const SERVER_SUBCOMMANDS = new Set(['start', 'stop', 'restart', 'reconfig', 'update']);

// A local test project is self-contained under tests/, same layout as a
// server project's projects/<slug>/tests/. The cwd-root paths are only a
// fallback for projects scaffolded before that unification.
const backendEnvPath = path.join(plumRoot, 'backend', '.env');
const testsEnvPath = path.join(userTestsPath, '.env');
const legacyRootEnvPath = path.join(process.cwd(), '.env');

// A step definition only exists in Cucumber; create-test handles both frameworks
// itself. The folder is the source of truth here: this runs inside a project
// directory, with no database to ask.
function refuseUnlessGherkin(command) {
	const root = resolveLocalTestsRoot() ?? userTestsPath;
	if (fs.existsSync(path.join(root, 'playwright.config.ts'))) {
		console.error(
			`✗ ${command} generates a .feature file and step definitions, which a Playwright ` +
				`project does not use.\n  Add a spec under specs/ instead, see tests/README.md.`
		);
		process.exit(1);
	}
}

// A tests folder is recognised by either framework's marker. Recognising only
// features/ made every Playwright project fall through to the fallback.
const TESTS_ROOT_MARKERS = ['playwright.config.ts', 'cucumber.js', 'features'];

function resolveLocalTestsRoot(explicit) {
	const override = explicit ?? process.env.TESTS_ROOT;
	const candidates = override
		? [path.resolve(process.cwd(), override)]
		: [userTestsPath, process.cwd()];
	return (
		candidates.find((dir) => TESTS_ROOT_MARKERS.some((m) => fs.existsSync(path.join(dir, m)))) ??
		null
	);
}

// Sync an .env into backend/.env so the local toolchain (which runs from
// backend/, where hooks.ts calls dotenv.config()) picks it up.
function copyEnvFile(src) {
	try {
		if (fs.existsSync(src)) {
			fse.copySync(src, backendEnvPath);
		} else {
			clack.log.warn(`.env not found (${src}), skipping backend sync.`);
		}
	} catch (err) {
		clack.log.error(`Error copying .env: ${err.message}`);
	}
}

const backendLib = path.join(plumRoot, 'backend', 'lib');
const defaultsConstants = () => require(path.join(plumRoot, 'backend', 'constants', 'defaults.js'));
const serverConfigLib = () => require(path.join(backendLib, 'serverConfig.js'));
const nodeRegisterLib = () => require(path.join(backendLib, 'nodeRegister.js'));
const runnerProcessLib = () => require(path.join(backendLib, 'runnerProcess.js'));
const globalRegistryLib = () => require(path.join(backendLib, 'globalRegistry.js'));
const bootServiceLib = () => require(path.join(backendLib, 'bootService.js'));

// A real secret is one hex/base64 line, drop a stray license header (the
// add-license bug used to prepend one to persisted secrets / node configs).
function cleanSecret(v) {
	if (!v) return null;
	const last = String(v)
		.split(/\r?\n/)
		.map((l) =>
			l
				.trim()
				.replace(/^\/\*|\*\/$/g, '')
				.trim()
		)
		.filter(Boolean)
		.pop();
	return last && /^[A-Za-z0-9+/=_-]{16,}$/.test(last) ? last : null;
}

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

const FRAMEWORK_HINTS = {
	playwright: 'spec files, native runner, recommended',
	cucumber: 'Gherkin .feature files and step definitions'
};

// A bare host:port silently breaks link generation and CORS, so require a scheme.
async function promptPublicUrl(message, initial) {
	for (;;) {
		const v = await clack.text({
			message:
				`${message}, include the scheme (http:// or https://). ` +
				'Add the :port unless a reverse proxy terminates it on 80/443.',
			placeholder: initial,
			defaultValue: initial
		});
		if (clack.isCancel(v)) cancelAndExit();
		const val = (v || initial).trim();
		if (/^https?:\/\//i.test(val)) return val.replace(/\/+$/, '');
		clack.log.warn('Needs a scheme, start with http:// or https://');
	}
}

// onFree() fires when the user agrees to free an in-use port, lets the caller flag it for clearing.
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
			message: `Port ${port} is in use (pid ${pid}), free it when Plum starts?`,
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

/**
 * Why the API and UI must not share an origin: the API mounts its routers at bare
 * paths (/reports, /settings, …) and the UI owns routes of the same names, so one
 * origin serving both has no way to tell them apart. They are separate ports by
 * default; this refuses the configurations where that stops being true.
 *
 * Returns an error string, or null when the pair is usable.
 */
// There is no stored mode: a network install is one whose URLs are not loopback,
// which is the same thing the old `mode` field recorded and could contradict.
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;
const isNetworkUrl = (u) => !!u && !LOOPBACK.test(u.trim());

function serverUrlProblem(apiUrl, uiUrl) {
	let api;
	let ui;
	try {
		api = new URL(apiUrl);
		ui = new URL(uiUrl);
	} catch {
		return 'Both URLs must be absolute, starting with http:// or https://';
	}
	if (api.origin === ui.origin) {
		return (
			`The API and the UI cannot both be ${api.origin}. They serve overlapping ` +
			'paths, so give them different ports or hostnames.'
		);
	}
	// A page served over https cannot call an http API: the browser blocks it as
	// mixed content, with nothing visible on the server side.
	if (ui.protocol !== api.protocol) {
		return `Use the same scheme for both: the UI is ${ui.protocol} and the API is ${api.protocol}.`;
	}
	return null;
}

async function configureServer({ force }) {
	const { loadServerConfig, saveServerConfig } = serverConfigLib();
	const { FRAMEWORKS, DEFAULT_FRAMEWORK, frameworkLabel, isFramework } = defaultsConstants();
	const cwd = process.cwd();
	const args = process.argv.slice(3);
	const cfg = loadServerConfig(cwd);

	const overrides = {
		framework: getFlag(args, '--framework'),
		backendPort: getFlag(args, '--backend-port'),
		frontendPort: getFlag(args, '--frontend-port'),
		apiUrl: getFlag(args, '--api-url'),
		uiUrl: getFlag(args, '--ui-url')
	};
	if (getFlag(args, '--mode') !== undefined) {
		clack.log.error(
			'--mode is gone. A network install is just its URLs: pass --api-url and --ui-url. ' +
				'Omit both for a local one.'
		);
		process.exit(1);
	}
	if (overrides.framework !== undefined) {
		const wanted = String(overrides.framework).toLowerCase();
		if (!isFramework(wanted)) {
			clack.log.error(
				`Unknown framework "${overrides.framework}". Use ${FRAMEWORKS.join(' or ')}.`
			);
			process.exit(1);
		}
		cfg.framework = wanted;
	}
	if (overrides.backendPort !== undefined) cfg.backendPort = overrides.backendPort;
	if (overrides.frontendPort !== undefined) cfg.frontendPort = overrides.frontendPort;
	if (overrides.apiUrl !== undefined) cfg.apiUrl = overrides.apiUrl;
	if (overrides.uiUrl !== undefined) cfg.uiUrl = overrides.uiUrl;

	const hasFlags = anyFlags(args, [
		'--framework',
		'--backend-port',
		'--frontend-port',
		'--api-url',
		'--ui-url'
	]);
	const interactive = force || (interactiveAllowed() && !hasFlags);

	if (interactive) {
		const framework = await clack.select({
			message: 'Which test framework should new projects on this server use?',
			options: FRAMEWORKS.map((id) => ({
				value: id,
				label: frameworkLabel(id),
				hint: FRAMEWORK_HINTS[id]
			})),
			initialValue: isFramework(cfg.framework) ? cfg.framework : DEFAULT_FRAMEWORK
		});
		if (clack.isCancel(framework)) cancelAndExit();
		cfg.framework = framework;
		clack.log.info(
			`Each project picks its framework when it is created, and cannot change afterwards. ` +
				`${frameworkLabel(framework)} will be pre-selected.`
		);

		const mode = await clack.select({
			message: 'Where are you setting up Plum?',
			options: [
				{ value: 'production', label: 'Production / Network server' },
				{ value: 'local', label: 'Local machine' }
			],
			initialValue: isNetworkUrl(cfg.apiUrl) ? 'production' : 'local'
		});
		if (clack.isCancel(mode)) cancelAndExit();

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
			for (;;) {
				cfg.apiUrl = await promptPublicUrl(
					'Public URL or IP of the Plum backend / API',
					cfg.apiUrl || `http://localhost:${cfg.backendPort}`
				);
				cfg.uiUrl = await promptPublicUrl(
					'Public URL or IP of the Plum UI (frontend)',
					cfg.uiUrl || `http://localhost:${cfg.frontendPort}`
				);
				const problem = serverUrlProblem(cfg.apiUrl, cfg.uiUrl);
				if (!problem) break;
				clack.log.warn(problem);
			}
		} else {
			cfg.apiUrl = `http://localhost:${cfg.backendPort}`;
			cfg.uiUrl = `http://localhost:${cfg.frontendPort}`;
		}
	} else {
		if (!isFramework(cfg.framework)) cfg.framework = DEFAULT_FRAMEWORK;
		// No URL given and none saved means local, which is loopback on the chosen ports.
		if (!cfg.apiUrl) cfg.apiUrl = `http://localhost:${cfg.backendPort}`;
		if (!cfg.uiUrl) cfg.uiUrl = `http://localhost:${cfg.frontendPort}`;
	}

	const urlProblem = serverUrlProblem(cfg.apiUrl, cfg.uiUrl);
	if (urlProblem) {
		clack.log.error(urlProblem);
		process.exit(1);
	}

	saveServerConfig(cwd, cfg);
	globalRegistryLib().registerInstall('server', cwd);
	return cfg;
}

// Copies one framework's scaffold into a tests folder. `overwrite: false` makes it
// a safe fill-in: an operator's edited files and extra tests are left untouched,
// missing ones added.
// Never copied out of the scaffold: a stray build or dependency folder there would
// otherwise land in every project.
const SCAFFOLD_SKIP = new Set(['node_modules', 'test-results', 'playwright-report', 'blob-report']);

function scaffoldProjectDir(testsDir, framework) {
	fse.copySync(path.join(scaffoldTestsPath, framework), testsDir, {
		overwrite: false,
		errorOnExist: false,
		filter: (src) => !SCAFFOLD_SKIP.has(path.basename(src))
	});
	// Shipped as `gitignore`: npm strips a file literally named .gitignore from the
	// published tarball, so it can only reach a project under another name.
	const ignoreSrc = path.join(testsDir, 'gitignore');
	const ignoreDest = path.join(testsDir, '.gitignore');
	if (fs.existsSync(ignoreSrc) && !fs.existsSync(ignoreDest)) fs.renameSync(ignoreSrc, ignoreDest);
	const env = path.join(testsDir, '.env');
	if (!fs.existsSync(env)) fs.copyFileSync(path.join(testsDir, '.env.example'), env);
}

// The scaffold's own README is server-oriented, so `plum init` writes this one
// for a standalone project. Framework-specific throughout: a Playwright project
// has no features/ or step_definitions/, and telling its owner otherwise is the
// first thing they read.
function buildTestsReadme(framework) {
	const pw = framework === 'playwright';
	const run = pw ? 'npx playwright test' : 'npx cucumber-js';

	const commands = pw
		? [
				'| `npx playwright test` | Run everything |',
				'| `npx playwright test --grep @TC-001` | Run one test by tag |',
				'| `npx playwright test --project=firefox` | One browser |',
				'| `npx playwright test --workers 4` | In parallel |',
				'| `npx playwright test --ui` | Playwright UI mode |'
			]
		: [
				'| `npx cucumber-js` | Run everything |',
				'| `npx cucumber-js --tags @TC-001` | Run one scenario by tag |',
				'| `BROWSER=firefox npx cucumber-js` | One browser |',
				'| `npx cucumber-js --parallel 4` | In parallel |'
			];

	const layout = pw
		? [
				'specs/                 your .spec.ts tests',
				'fixtures/pages.ts      your page-object fixtures',
				'fixtures/plum.ts       session recording (Plum’s, leave it alone)',
				'pages/                 Page Object Models (optional)',
				'playwright.config.ts   browsers, timeouts, traces, reporters',
				'.env                   BASE_URL and IS_HEADLESS'
			]
		: [
				'features/              Gherkin .feature files',
				'step_definitions/      TypeScript step implementations',
				'pages/                 Page Object Models (optional)',
				'utils/                 browser setup and hooks (Plum’s recording lives here)',
				'cucumber.js            paths, requires, formatters',
				'.env                   BASE_URL and IS_HEADLESS'
			];

	const tagExample = pw
		? [
				'```ts',
				"test('User can log in', { tag: '@TC-001' }, async ({ page, plumStep }) => {",
				'\t// ...',
				'});',
				'```'
			]
		: [
				'```gherkin',
				'@TC-001',
				'Scenario: User can log in',
				'  Given I am on the login page',
				'```'
			];

	const resources = pw
		? [
				'- [Playwright test API](https://playwright.dev/docs/api/class-test)',
				'- [Locators](https://playwright.dev/docs/locators) and [assertions](https://playwright.dev/docs/test-assertions)',
				'- [Trace viewer](https://playwright.dev/docs/trace-viewer), for debugging a failed run'
			]
		: [
				'- [Gherkin reference](https://cucumber.io/docs/gherkin/reference/)',
				'- [Step definitions](https://cucumber.io/docs/cucumber/step-definitions/)',
				'- [Playwright docs](https://playwright.dev/docs/intro), the browser API used in page objects'
			];

	return [
		'# My Tests',
		'',
		`Powered by [Plum](https://github.com/silverlunah/plum), ${pw ? 'Playwright' : 'Cucumber'} + Test Repository.`,
		'',
		'## Getting started',
		'',
		'1. Set `BASE_URL` in `.env` to your application.',
		`2. Run the example tests: \`${run}\``,
		'3. Add your own with `plum create-test`.',
		...(pw ? [] : ['   `plum create-step` adds a step to an existing feature file.']),
		'',
		'Set `IS_HEADLESS=false` in `.env` to watch the browser.',
		'',
		'## Commands',
		'',
		'| Command | Description |',
		'| --- | --- |',
		...commands,
		'| `plum server start` | Start the full UI via Docker |',
		'',
		'## Layout',
		'',
		'```',
		...layout,
		'```',
		'',
		`Give every ${pw ? 'test' : 'scenario'} its own tag. Tags are ids: two sharing one cannot be told apart in a report, or matched to separate cases in the repository.`,
		'',
		...tagExample,
		'',
		'## Test Repository',
		'',
		'Running `plum server start` adds a web UI with suites, test cases and manual test runs. Name a case so its ID matches a tag above (case `TC-001` ↔ test `@TC-001`) and Plum marks it automated.',
		'',
		'## Reference',
		'',
		...resources,
		'- [Plum documentation](https://github.com/silverlunah/plum)'
	].join('\n');
}

// `plum init` leaves a project that cannot run otherwise: no tests/node_modules,
// so the runner CLI is missing, and no browser binaries. Both are warn-only, an
// offline machine should still end up with a scaffold it can install later.
function installTestsProjectDeps(testsPath) {
	try {
		clack.log.step('Installing test dependencies...');
		execSync('npm install --no-audit --no-fund', { cwd: testsPath, stdio: 'inherit' });
	} catch {
		clack.log.warn('Could not install test dependencies. Run `npm install` in tests/ yourself.');
		return;
	}
	try {
		clack.log.step('Downloading browsers...');
		execSync('npx playwright install chromium firefox webkit', {
			cwd: testsPath,
			stdio: 'inherit'
		});
	} catch {
		clack.log.warn(
			'Could not download browsers. Run `npx playwright install chromium firefox webkit` in tests/.'
		);
	}
}

function applyServerConfig(cfg) {
	const { writeEnvFile, buildOverrideYaml } = serverConfigLib();
	const cwd = process.cwd();
	// The whole ./projects tree is bind-mounted; the backend fills in each
	// projects/<slug>/tests/ folder itself, so the dir just has to exist.
	fs.mkdirSync(path.join(cwd, 'projects'), { recursive: true });
	writeEnvFile(cwd);
	copyEnvFile(legacyRootEnvPath);
	const testsDir = path.join(cwd, 'tests');
	const testsAbs = fs.existsSync(testsDir) ? testsDir.replace(/\\/g, '/') : null;
	fs.writeFileSync(
		overrideFilePath,
		buildOverrideYaml({
			testsAbs,
			dataAbs: path.resolve(cwd, 'data').replace(/\\/g, '/'),
			projectsAbs: path.join(cwd, 'projects').replace(/\\/g, '/'),
			backendPort: cfg.backendPort,
			framework: cfg.framework,
			apiUrl: cfg.apiUrl,
			plumVersion: readPlumVersion()
		}),
		'utf8'
	);
	clack.log.success('docker-compose.override.yml written');
}

// Node's fetch resolves "localhost" to ::1 first on many Linux distros (Debian
// included). If Docker only published the port on IPv4, that first attempt hangs
// until it times out on every poll, eating the whole budget even though the port
// is reachable, and reachable fine from a browser, which races both families.
// 127.0.0.1 sidesteps the DNS/happy-eyeballs mismatch entirely.
const READY_POLL_INTERVAL_MS = 2000;
const READY_POLL_MAX_ATTEMPTS = 90; // ~3 minutes
// Each poll attempt must itself be bounded, a single fetch() with no timeout
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
				`Still waiting for server to be ready… (${Math.round((i * READY_POLL_INTERVAL_MS) / 1000)}s, check "docker compose logs -f backend" if this feels stuck)`
			);
		}
	}
	s.stop(
		ready
			? pc.green('✓ Server is ready')
			: pc.yellow('Server did not respond in time, it may still be starting')
	);
	return ready;
}

async function runFirstUserSetup(apiBase, uiUrl) {
	let needsSetup = false;
	try {
		const res = await fetchWithTimeout(`${apiBase}/auth/needs-setup`);
		needsSetup = (await res.json()).needsSetup;
	} catch {}

	if (needsSetup) {
		clack.log.info(
			`Open ${pc.cyan(`${uiUrl}/setup`)} to create your organization, first project, and admin account.`
		);
	}
}

// A stale process on the backend/frontend port fails the whole stack with a
// bind error, clear it before `docker compose up`.
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
// crash the process with a raw stack trace, that would abort serverStart()
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
			`Docker failed to start the stack, see the output above for the cause.\n` +
				`A common cause is another process already using port ${cfg.backendPort} or ${cfg.frontendPort}; ` +
				`try ${pc.cyan('plum server reconfig')} to pick different ports.`
		);
		return false;
	}
}

async function serverStart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Server  ')));
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
	printNodeSecretHint();
	clack.outro(pc.green('Plum is running. Use "plum server stop" to shut down.'));
}

// A node on another machine needs this to register; one here reads it itself.
function printNodeSecretHint() {
	const secret = readNodeSecretFromPrimary();
	if (secret) {
		clack.log.info(
			`Runner nodes: \`plum manage-nodes\` here, or \`plum node start\` elsewhere with\n` +
				`  PLUM_NODE_SECRET=${pc.dim(secret)}`
		);
	}
}

async function serverRestart() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Server Restart  ')));
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
	printNodeSecretHint();
	clack.outro(pc.green('Server restarted.'));
}

// A fresh `npm publish` can take a minute or two to fully propagate across
// npm's CDN edges, hitting a stale one right after publishing produces an
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
					`npm install failed (attempt ${attempt}/${NPM_INSTALL_RETRIES}), this is often a transient registry propagation delay right after a new release. Retrying in ${NPM_INSTALL_RETRY_DELAY_MS / 1000}s…`
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
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Update  ')));

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
	// restart steps rather than calling serverRestart()/nodeRestart() directly,
	// this same process already loaded the OLD code into memory before npm
	// install ran above, so calling them in-process would rebuild using stale
	// logic no matter how new the just-installed files on disk actually are.
	for (const dir of getInstalls('server')) {
		if (!fs.existsSync(path.join(dir, '.plum-server.json'))) continue;

		// This registry is global to the machine, not scoped to the directory
		// `plum update` was run from, an unrelated project on the same machine
		// as a registered server would otherwise silently boot that server's
		// Docker stack. Ask first whenever there's someone to ask; a
		// non-interactive run (CI, cron, systemd) has no one to ask and keeps
		// the previous unconditional behavior.
		if (interactiveAllowed()) {
			const proceed = await clack.confirm({
				message: `Found a registered server at ${dir}, restart it?`,
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
		// leaves the OLD node process running mismatched code, it still answers
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
			'No running server or node found, run `plum server start` or `plum node start` when ready.'
		);
	}

	clack.outro(pc.green(`Plum updated: ${fromVersion} → ${toVersion}`));
}

async function serverReconfig() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Reconfigure Server  ')));
	const cfg = await configureServer({ force: true });
	applyServerConfig(cfg);
	clack.log.success("Saved. Run 'plum server start' to apply.");
	clack.outro(`UI: ${pc.cyan(cfg.uiUrl)}`);
}

/* -----------------------------------------------------
 *                 Node flow
 * ------------------------------------------------------ */

// `plum node <sub> <name>`, the first positional after the subcommand.
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
		clack.log.warn('No nodes configured here yet, run `plum node start <name>`.');
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
	const flagDriven = anyFlags(args, ['--primary', '--url', '--port', '--token', '--browser']);
	const canAsk = force || (interactiveAllowed() && !flagDriven);

	// Name first, the saved config for that name seeds the other defaults.
	if (!name && canAsk) {
		const v = await clack.text({
			message: 'Node name or alias, call it whatever you like',
			placeholder: 'node-1',
			defaultValue: 'node-1'
		});
		if (clack.isCancel(v)) cancelAndExit();
		name = v || 'node-1';
	}
	if (!name) name = `node-${generateToken().slice(0, 6)}`;

	const saved = loadNodeByName(name);
	const preexisting = Object.keys(saved).length > 0;

	// A name on its own carries no connection details, so it must not stand in for
	// the answers: `plum node start node-2` is the documented way to register a node
	// on a second machine, and it has to ask where the server is. Only a config that
	// already knows its primary can skip the questions and just start.
	const interactive = canAsk && !(preexisting && saved.primary);

	let mode = getFlag(args, '--mode') ?? saved.mode ?? 'local';
	let primary = getFlag(args, '--primary') ?? process.env.PRIMARY_URL ?? saved.primary ?? '';
	// Away from 3001 (primary) and 3002 (frontend) so a co-located node doesn't collide.
	let port = getFlag(args, '--port') ?? saved.port ?? '9001';
	let browser = getFlag(args, '--browser') ?? saved.browser ?? 'chromium';
	let token = getFlag(args, '--token') ?? process.env.NODE_TOKEN ?? saved.token ?? generateToken();
	let url = getFlag(args, '--url') ?? saved.url ?? '';
	// Read from a co-located server; a remote node needs it passed in. cleanSecret
	// drops a stray license header that the old add-license bug prepended.
	// The primary is asked before the saved copy on purpose. A node config
	// outlives the server that issued its secret (~/.plum survives an uninstall,
	// and the server regenerates the secret in whatever directory it is started
	// from), so a stale saved value used to win, register with the wrong secret,
	// and never prompt because a value had been found.
	let nodeSecret =
		cleanSecret(getFlag(args, '--node-secret')) ||
		cleanSecret(process.env.PLUM_NODE_SECRET) ||
		cleanSecret(readNodeSecretFromPrimary()) ||
		cleanSecret(saved.nodeSecret) ||
		'';

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
				'Public URL or IP of the Plum backend / API',
				primary || 'https://plum.example.com'
			);
		} else {
			const bp = await clack.text({
				message:
					'Port your Plum backend runs on (default 3001, if you changed it or are unsure, ' +
					'run `docker compose ps` or check Docker Desktop on the server machine)',
				placeholder: '3001',
				defaultValue: '3001'
			});
			if (clack.isCancel(bp)) cancelAndExit();
			primary = `http://localhost:${(bp || '3001').trim()}`;
		}

		const portVal = await clack.text({
			message:
				'Port this node will listen on, it runs there, and any process already using ' +
				'that port is stopped when the node starts',
			placeholder: port,
			defaultValue: port
		});
		if (clack.isCancel(portVal)) cancelAndExit();
		port = (portVal || port).trim();

		if (mode === 'production') {
			url = await promptPublicUrl(
				'Public URL or IP the Plum server uses to reach this node',
				url && !url.includes('host.docker.internal') ? url : 'https://node-1.example.com'
			);
		} else {
			// Local primary runs in Docker, it reaches a host node via
			// host.docker.internal, not localhost.
			url = `http://host.docker.internal:${port}`;
			clack.log.info(`This node will register with the server as ${pc.cyan(url)}`);
		}

		// Couldn't read it from a co-located server, ask, whatever the mode.
		if (!nodeSecret) {
			const s = await clack.text({
				message: 'PLUM_NODE_SECRET, Settings → Runners → Registration secret (or `plum server`)',
				placeholder: 'a1b2c3…'
			});
			if (clack.isCancel(s)) cancelAndExit();
			nodeSecret = cleanSecret(s) || '';
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
		nodeSecret,
		primary,
		browser,
		port,
		pid: saved.pid ?? null
	});
	globalRegistryLib().registerInstall('node', nodeHome(name));
	return { primary, port, browser, token, nodeSecret, name, url, mode, preexisting };
}

async function registerNode({ primary, name, url, token, nodeSecret, browser, port }) {
	const { registerWithPrimary, loadNodeByName, saveNodeByName } = nodeRegisterLib();
	let registeredId = null;

	if (primary) {
		const s = clack.spinner();
		s.start(`Registering "${name}" with primary at ${primary}...`);
		try {
			const { id, reused } = await registerWithPrimary({
				primary,
				name,
				url,
				token,
				nodeSecret,
				browser
			});
			registeredId = id;
			s.stop(
				pc.green(reused ? `✓ Updated "${name}" on primary` : `✓ Registered "${name}" on primary`)
			);
		} catch (e) {
			s.stop(pc.yellow(`Could not register with primary: ${e.message}`));
		}
	} else {
		clack.log.warn('No --primary given, the node is configured but not registered anywhere.');
	}

	saveNodeByName(name, {
		...loadNodeByName(name),
		id: registeredId,
		name,
		url,
		token,
		nodeSecret,
		primary,
		browser,
		port
	});
	return registeredId;
}

// Register a node with the primary and start its process here, this is the one
// path both `plum node start` and manage-nodes' "Add new node" run.
async function bringNodeUp(cfg) {
	const { prepareEnv, startNode, findPidOnPort, killPort, nodeReachable } = runnerProcessLib();

	const registeredId = await registerNode(cfg);
	if (!registeredId) {
		// A node that never registered has no business leaving its config, token and
		// secret on disk: it showed up in `plum node list` as a phantom holding a
		// port. An already-registered node keeps its config, the failure is transient.
		if (!cfg.preexisting) {
			const { deleteNodeByName, nodeHome } = nodeRegisterLib();
			deleteNodeByName(cfg.name);
			globalRegistryLib().unregisterInstall('node', nodeHome(cfg.name));
			clack.log.info('Removed the local config for a node that never registered.');
		}
		clack.outro(pc.red('Node not started.'));
		process.exitCode = 1;
		return;
	}

	clack.log.step('Preparing environment (deps + browsers)...');
	try {
		prepareEnv();
	} catch (e) {
		clack.log.error(
			`Environment prep failed: ${e.message}, not starting (tests would fail at browser launch).`
		);
		clack.outro(pc.red('Node not started.'));
		process.exitCode = 1;
		return;
	}

	if (findPidOnPort(Number(cfg.port))) {
		clack.log.step(`Port ${cfg.port} is in use, freeing it...`);
		await killPort(Number(cfg.port));
	}

	const entry = startNode({ id: String(registeredId), port: cfg.port, token: cfg.token });
	clack.log.step(`Starting "${cfg.name}" on port ${cfg.port} (pid ${entry.pid})...`);
	const up = await nodeReachable(`http://localhost:${cfg.port}`, cfg.token, 15000);
	if (up) {
		clack.outro(
			pc.green(`Node "${cfg.name}" running (pid ${entry.pid}), logs at ${entry.logFile}`)
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

// undefined = leave the boot entry alone (the boot service itself re-runs
// `node start` with no flag, it must not re-prompt or reinstall).
async function resolveBootChoice(args) {
	if (anyFlags(args, ['--boot'])) return true;
	if (anyFlags(args, ['--no-boot'])) return false;
	if (!interactiveAllowed()) return undefined;
	const v = await clack.confirm({
		message: 'Start this node automatically when the machine boots?',
		initialValue: false
	});
	if (clack.isCancel(v)) return undefined;
	return v;
}

async function applyBootChoice(name, choice) {
	if (choice === undefined) return;
	// The node is already running by this point, a boot-persistence failure
	// (no systemd user session, no launchd, locked-down schtasks) must never
	// take the whole `node start` down with it.
	try {
		const { installNodeBoot, removeNodeBoot } = bootServiceLib();
		if (choice) {
			const res = installNodeBoot(name);
			if (res.ok) {
				clack.log.success(`"${name}" will start on boot.`);
				if (res.hint) clack.log.info(res.hint);
			} else {
				clack.log.warn(`Couldn't set up start-on-boot: ${res.reason}`);
				if (res.hint) clack.log.info(res.hint);
			}
		} else {
			removeNodeBoot(name);
			clack.log.info(`"${name}" will not start on boot.`);
		}
	} catch (e) {
		clack.log.warn(`Couldn't update start-on-boot: ${e.message}`);
	}
}

async function nodeStart({ reconfig, name }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Node  ')));
	migrateLegacyNodes();
	const cfg = await configureNode({ force: reconfig, name });
	await bringNodeUp(cfg);
	if (!process.exitCode) {
		await applyBootChoice(cfg.name, await resolveBootChoice(process.argv.slice(3)));
	}
}

async function nodeRestart({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Node Restart  ')));
	migrateLegacyNodes();
	const { loadNodeByName } = nodeRegisterLib();
	const { prepareEnv, stopNode, startNode, killPort, nodeReachable } = runnerProcessLib();

	const target = resolveNodeName(nameArg);
	if (!target) return clack.outro(pc.dim('Done.'));
	const cfg = loadNodeByName(target);
	if (!cfg.id) {
		clack.outro(pc.yellow(`"${target}" isn't registered, run \`plum node start ${target}\`.`));
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
			pc.red(`"${target}" didn't come back on port ${cfg.port}, check ${entry.logFile}.`)
		);
		process.exitCode = 1;
		clack.outro(pc.red('Restart unverified.'));
	}
}

async function nodeStop({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Node Stop  ')));
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

// Deleting a node in the web UI cannot reach this machine, so its config stays
// here holding a token and node secret for a runner that no longer exists. Ask
// each primary once which ids it still knows and flag the leftovers, so
// `plum node delete` has something to act on. Silent when a primary is down:
// unreachable is not the same as deleted.
async function knownRunnerIds(primary, secret) {
	try {
		const res = await fetch(`${primary.replace(/\/$/, '')}/runners`, {
			headers: secret ? { Authorization: `Bearer ${secret}` } : {},
			signal: AbortSignal.timeout(4000)
		});
		if (!res.ok) return null;
		const { runners } = await res.json();
		return new Set((runners ?? []).map((r) => String(r.id)));
	} catch {
		return null;
	}
}

async function nodeList() {
	migrateLegacyNodes();
	const { listNodeNames, loadNodeByName } = nodeRegisterLib();
	const { statusOf } = runnerProcessLib();
	const names = listNodeNames();
	if (names.length === 0) {
		clack.log.info('No nodes on this machine, add one with `plum node start <name>`.');
		return;
	}
	const { nodeBootStatus } = bootServiceLib();
	const configs = names.map((n) => [n, loadNodeByName(n)]);

	const knownByPrimary = new Map();
	for (const [, c] of configs) {
		if (!c.primary || knownByPrimary.has(c.primary)) continue;
		const secret = process.env.PLUM_NODE_SECRET || c.nodeSecret || '';
		knownByPrimary.set(c.primary, await knownRunnerIds(c.primary, secret));
	}

	let orphans = 0;
	for (const [n, c] of configs) {
		const running = c.id && statusOf(String(c.id)) === 'running';
		const boot = nodeBootStatus(n) === 'enabled' ? pc.dim(' ⏻ boot') : '';
		const known = c.primary ? knownByPrimary.get(c.primary) : null;
		const orphaned = known && c.id && !known.has(String(c.id));
		if (orphaned) orphans++;
		const flag = orphaned ? pc.yellow('  deleted on primary') : '';
		console.log(
			`${running ? pc.green('●') : pc.dim('○')} ${n.padEnd(16)} ${pc.dim((c.url || '') + '  :' + (c.port || '?'))}${boot}${flag}`
		);
	}
	if (orphans > 0) {
		clack.log.warn(
			`${orphans} node${orphans > 1 ? 's' : ''} still ${orphans > 1 ? 'hold' : 'holds'} a token and secret here but no ` +
				'longer exist on the primary. Remove with `plum node delete <name>`.'
		);
	}
}

async function deleteOneNode(target) {
	const { loadNodeByName, deleteNodeByName, nodeHome } = nodeRegisterLib();
	const { stopNode, killPort, forgetNode } = runnerProcessLib();
	const { unregisterInstall } = globalRegistryLib();

	const cfg = loadNodeByName(target);

	stopNode(String(cfg.id ?? target), cfg.port ? Number(cfg.port) : null);
	if (cfg.port) await killPort(Number(cfg.port));

	if (cfg.id && cfg.primary) {
		// The primary is asked first for the same reason as on registration: this
		// node's saved copy may predate the server's current secret.
		const secret =
			process.env.PLUM_NODE_SECRET || readNodeSecretFromPrimary() || cfg.nodeSecret || '';
		try {
			const res = await fetch(`${cfg.primary.replace(/\/$/, '')}/runners/${cfg.id}`, {
				method: 'DELETE',
				headers: secret ? { Authorization: `Bearer ${secret}` } : {},
				signal: AbortSignal.timeout(10000)
			});
			// 404 means someone already removed it there (typically in the web UI),
			// which is the usual reason to be cleaning up locally at all.
			if (res.ok) clack.log.success(`Removed "${target}" from primary.`);
			else if (res.status === 404) clack.log.info(`"${target}" was already gone from primary.`);
			else clack.log.warn(`Primary responded HTTP ${res.status} for "${target}"`);
		} catch (e) {
			clack.log.warn(`Could not reach primary for "${target}": ${e.message}`);
		}
	}

	bootServiceLib().removeNodeBoot(target);
	deleteNodeByName(target);
	forgetNode(String(cfg.id ?? target));
	unregisterInstall('node', nodeHome(target));
}

// No name deletes every node on this machine. Deleting one at a time left the
// rest of a dev fleet registered, which is never what "clean up" meant.
async function nodeDelete({ name: nameArg }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Node Delete  ')));
	migrateLegacyNodes();
	const { listNodeNames } = nodeRegisterLib();

	const targets = nameArg ? [nameArg] : listNodeNames();
	if (targets.length === 0) return clack.outro(pc.dim('No nodes on this machine.'));

	if (!nameArg && targets.length > 1 && interactiveAllowed()) {
		const ok = await clack.confirm({
			message: `Delete all ${targets.length} nodes on this machine (${targets.join(', ')})?`
		});
		if (clack.isCancel(ok) || !ok) return clack.outro(pc.dim('Cancelled.'));
	}

	for (const target of targets) await deleteOneNode(target);
	clack.outro(
		pc.green(
			targets.length === 1
				? `Deleted "${targets[0]}", process, local config, and primary registration.`
				: `Deleted ${targets.length} nodes: ${targets.join(', ')}.`
		)
	);
}

async function nodeReconfig({ name }) {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Reconfigure Node  ')));
	migrateLegacyNodes();
	const cfg = await configureNode({ force: true, name });
	await registerNode(cfg);
	clack.outro(pc.dim(`Saved. Run \`plum node restart ${cfg.name}\` to apply.`));
}

// Reads PLUM_NODE_SECRET from the primary's container (env override, else the
// generated data/.plum-node-secret) so a co-located node and the menu need no
// setup. null on a node-only box, the caller then needs --node-secret.
function readNodeSecretFromPrimary() {
	const { getInstalls } = globalRegistryLib();
	for (const dir of getInstalls('server')) {
		// The file first: data/ is bind-mounted into the server's own directory, so
		// this works whatever the install layout. `docker compose exec` cannot stand in
		// for it, because the compose files live in the package directory, not the one
		// the server was started from: on a global install those are different folders,
		// and the exec failed with "no configuration file provided", leaving a node with
		// no secret to register with.
		try {
			const cleaned = cleanSecret(
				fs.readFileSync(path.join(dir, 'data', '.plum-node-secret'), 'utf8')
			);
			if (cleaned) return cleaned;
		} catch {}
		try {
			const secret = execSync(
				'docker compose exec -T backend sh -c "printenv PLUM_NODE_SECRET || cat data/.plum-node-secret"',
				{ cwd: plumRoot, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }
			)
				.toString()
				.trim();
			// cleanSecret because the fallback `cat` can return a file that a past
			// licence-header sweep prepended to. The server reads it correctly either
			// way, but an operator copying this line for a remote node would not.
			const cleaned = cleanSecret(secret);
			if (cleaned) return cleaned;
		} catch {}
	}
	return null;
}

async function openManageNodesMenu(primaryUrl, nodeSecret) {
	const manageScript = path.join(plumRoot, 'backend', 'scripts', 'manage-nodes.mjs');
	const apiUrl = primaryUrl || 'http://localhost:3001';
	const env = { ...process.env, PLUM_API_URL: apiUrl };
	const resolved = nodeSecret || env.PLUM_NODE_SECRET || readNodeSecretFromPrimary();
	if (resolved) env.PLUM_NODE_SECRET = resolved;
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
		clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Init  ')));

		const { FRAMEWORKS: INIT_FRAMEWORKS, frameworkLabel, isFramework } = defaultsConstants();
		const initFlag = getFlag(process.argv.slice(2), '--framework');
		if (initFlag !== undefined && !isFramework(initFlag)) {
			clack.log.error(`Unknown framework "${initFlag}". Use ${INIT_FRAMEWORKS.join(' or ')}.`);
			process.exit(1);
		}
		// This install's own default, from `plum server start`. Used to pre-select the
		// prompt, and taken as the answer when there is no terminal to ask.
		const configuredFramework = serverConfigLib().loadServerConfig(process.cwd()).framework;
		let initFramework = initFlag;
		if (!initFramework && interactiveAllowed()) {
			const picked = await clack.select({
				message: 'Which test framework?',
				options: INIT_FRAMEWORKS.map((id) => ({ value: id, label: frameworkLabel(id) })),
				initialValue: isFramework(configuredFramework) ? configuredFramework : INIT_FRAMEWORKS[0]
			});
			if (clack.isCancel(picked)) cancelAndExit();
			initFramework = picked;
		}
		initFramework ??= configuredFramework;

		// The whole test project lives in tests/, same self-contained layout as a
		// server project's projects/<slug>/tests/. Fill-in copy: an existing
		// project keeps its edits, missing scaffold files are added. README.md is
		// written separately (the scaffold's is server-oriented).
		const existed = fs.existsSync(userTestsPath);
		fse.copySync(path.join(scaffoldTestsPath, initFramework), userTestsPath, {
			overwrite: false,
			errorOnExist: false,
			filter: (src) => path.basename(src) !== 'README.md' && !SCAFFOLD_SKIP.has(path.basename(src))
		});
		{
			// npm strips a file named .gitignore from the tarball, so it ships as
			// `gitignore` and is renamed on the way in.
			const ignoreSrc = path.join(userTestsPath, 'gitignore');
			const ignoreDest = path.join(userTestsPath, '.gitignore');
			if (fs.existsSync(ignoreSrc) && !fs.existsSync(ignoreDest)) {
				fs.renameSync(ignoreSrc, ignoreDest);
			}
		}
		clack.log.success(existed ? '`tests/` filled in with missing files.' : '`tests/` created.');

		{
			const env = testsEnvPath;
			if (!fs.existsSync(env)) {
				fs.copyFileSync(path.join(userTestsPath, '.env.example'), env);
				clack.log.success('tests/.env created, set BASE_URL to your app.');
			} else {
				clack.log.warn('tests/.env already exists, skipping.');
			}
		}
		// The Cucumber extension is only useful to a Cucumber project; Playwright's
		// own extension discovers playwright.config.ts on its own.
		if (initFramework === 'cucumber') {
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

		// The scaffold ships its own tsconfig.json now; this only fills in a project
		// scaffolded before that, mapping the toolchain to the backend's copy.
		{
			const tsconfigPath = path.join(userTestsPath, 'tsconfig.json');
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
					include: ['**/*.ts']
				};
				fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf8');
				clack.log.success('tests/tsconfig.json created for IDE type resolution.');
			} else {
				clack.log.warn('tests/tsconfig.json already exists, skipping.');
			}
		}

		// tests/README.md
		{
			const userReadmePath = path.join(userTestsPath, 'README.md');
			if (!fs.existsSync(userReadmePath)) {
				const readmeContent = buildTestsReadme(initFramework);
				fs.writeFileSync(userReadmePath, readmeContent + '\n', 'utf8');
				clack.log.success('tests/README.md created.');
			} else {
				clack.log.warn('tests/README.md already exists, skipping.');
			}
		}

		// Install dependencies
		clack.log.step('Installing dependencies (npm run init)...');
		execSync('npm run init', { cwd: plumRoot, stdio: 'inherit' });
		installTestsProjectDeps(userTestsPath);

		const initPw = initFramework === 'playwright';
		const initRunAll = initPw ? 'npx playwright test' : 'npx cucumber-js';
		const initRunTag = initPw ? 'npx playwright test --grep @tag' : 'npx cucumber-js --tags @tag';

		clack.note(
			[
				`Your test project  ${pc.dim('→')}  ${pc.cyan('tests/')}  ${pc.dim('(open this folder in your editor)')}`,
				`App URL            ${pc.dim('→')}  ${pc.cyan('tests/.env')}  ${pc.dim(', set BASE_URL')}`,
				`Extra packages     ${pc.dim('→')}  ${pc.cyan('tests/package.json')}`,
				'',
				// The cd is not decoration: the runner config lives in tests/, and from the
				// parent folder Playwright finds the specs with no config to go with them
				// and fails with "did not expect test.describe() to be called here".
				`${pc.bold('Run tests locally')}  ${pc.dim('(from the tests folder)')}`,
				`  ${pc.cyan('cd tests')}`,
				`  ${pc.cyan(initRunAll)}${' '.repeat(Math.max(2, 34 - initRunAll.length))}run all tests`,
				`  ${pc.cyan(initRunTag)}${' '.repeat(Math.max(2, 34 - initRunTag.length))}run by tag`,
				'',
				`${pc.bold('Start the full UI')}  ${pc.dim('(requires Docker)')}`,
				`  ${pc.cyan('plum server start')}`,
				'',
				`${pc.bold('Generate tests')}`,
				`  ${pc.cyan('plum create-test')}         scaffold a new test`,
				...(initPw ? [] : [`  ${pc.cyan('plum create-step')}         add a step definition`])
			].join('\n'),
			'Next steps'
		);
		clack.outro(pc.magenta('Plum is ready.'));
		break;
	}

	case 'server':
		// Explicit list, then reject the unknown: falling through to serverStart()
		// meant `plum server -h` and any typo built images and started the stack.
		if (subcommand === '-h' || subcommand === '--help') {
			console.log(
				[
					'',
					`${pc.bold('Usage:')} plum server <command> [options]`,
					'',
					'  start      start the UI stack via Docker (default)',
					'  stop       stop the server, data preserved',
					'  restart    rebuild images and restart, no prompts',
					'  reconfig   re-enter settings without starting',
					'  update     update Plum, then restart servers and nodes',
					'',
					`  ${pc.dim('Passing any option below skips the prompts:')}`,
					'  --framework <playwright|cucumber> --backend-port <n> --frontend-port <n>',
					'  --api-url <url> --ui-url <url>   (both set = network install, neither = local)',
					''
				].join('\n')
			);
			break;
		}
		if (subcommand && !SERVER_SUBCOMMANDS.has(subcommand) && !subcommand.startsWith('--')) {
			console.log(`Unknown command "plum server ${subcommand}". Try ${pc.cyan('plum server -h')}.`);
			process.exitCode = 1;
			break;
		}
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
			`\nSpecify what to start:\n  ${pc.cyan('plum server start')}  , start the web UI stack (Docker)\n  ${pc.cyan('plum node start')}    , start a node\n`
		);
		process.exit(1);
		break;

	case 'restart':
		console.log(
			`\nSpecify what to restart:\n  ${pc.cyan('plum server restart')} , rebuild and restart the server\n  ${pc.cyan('plum node restart')}   , restart the node\n`
		);
		process.exit(1);
		break;

	case 'update':
		await serverUpdate();
		break;

	case 'stop':
		console.log(
			`\nSpecify what to stop:\n  ${pc.cyan('plum server stop')}   , stop the web UI stack\n  ${pc.cyan('plum node stop')}     , stop the node\n`
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
					'  delete [name]    stop it, delete its config, unregister it. No name: every node here',
					'  reconfig [name]  re-enter settings and re-register, without starting',
					'',
					'  Options for start: --mode <local|production> --primary <url> --url <url> --port <n> --token <s> --node-secret <s> --browser <chromium|firefox> --boot | --no-boot',
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
		await openManageNodesMenu(primaryUrl, getFlag(process.argv.slice(3), '--node-secret'));
		break;
	}

	case 'project': {
		const { slugify } = require(path.join(plumRoot, 'backend', 'lib', 'slugify'));
		// Stop at the first flag, the name is the words before it, so
		// `project init "Shop" --framework playwright` is named "Shop", not
		// "Shop --framework playwright".
		const nameWords = process.argv.slice(4);
		const firstFlag = nameWords.findIndex((a) => a.startsWith('--'));
		const name = (firstFlag === -1 ? nameWords : nameWords.slice(0, firstFlag)).join(' ').trim();
		if (process.argv[3] !== 'init' || !name) {
			console.log('Usage: plum project init "<project name>" [--framework <f>]');
			console.log("  --framework <f>    playwright | cucumber (default: this install's)");
			console.log('  Use the exact name from Settings → Projects. The server normally');
			console.log('  creates this folder for you, run this only to re-create it.');
			break;
		}
		const slug = slugify(name);
		if (!slug) {
			console.error('✗ Project name needs at least one letter or number (a–z, 0–9).');
			process.exit(1);
		}
		// No DB access from here, so the framework can't be read off the project.
		// It comes from the flag, falling back to this install's configured default.
		const { FRAMEWORKS, isFramework } = defaultsConstants();
		const wantedFramework = getFlag(process.argv.slice(3), '--framework');
		if (wantedFramework !== undefined && !isFramework(wantedFramework)) {
			console.error(`✗ Unknown framework "${wantedFramework}". Use ${FRAMEWORKS.join(' or ')}.`);
			process.exit(1);
		}
		const framework =
			wantedFramework ?? serverConfigLib().loadServerConfig(process.cwd()).framework;
		const testsDir = path.join(process.cwd(), 'projects', slug, 'tests');
		const exists = fs.existsSync(testsDir) && fs.readdirSync(testsDir).length > 0;
		scaffoldProjectDir(testsDir, framework);
		console.log(
			exists
				? `projects/${slug}/tests/ already exists, filled in any missing ${framework} files.`
				: `✓ Scaffolded projects/${slug}/tests/ for ${framework}`
		);
		console.log('');
		console.log('Next:');
		console.log(`  1. Set the app URL:  nano projects/${slug}/tests/.env   # BASE_URL=...`);
		console.log(`  2. Merge new tests straight into projects/${slug}/tests/, no restart.`);
		break;
	}

	case 'create-step': {
		refuseUnlessGherkin('create-step');
		const createStepScript = path.join(plumRoot, 'backend', 'config', 'scripts', 'create-step.mjs');
		execFileSync(process.execPath, [createStepScript], {
			cwd: process.cwd(),
			stdio: 'inherit',
			env: {
				...process.env,
				TESTS_ROOT: resolveLocalTestsRoot() ?? userTestsPath
			}
		});
		break;
	}

	case 'create-test': {
		const createTestScript = path.join(plumRoot, 'backend', 'config', 'scripts', 'create-test.mjs');
		execFileSync(process.execPath, [createTestScript, ...process.argv.slice(3)], {
			cwd: process.cwd(),
			stdio: 'inherit',
			env: {
				...process.env,
				TESTS_ROOT: resolveLocalTestsRoot() ?? userTestsPath
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
		console.log(
			'    --framework <f>    playwright | cucumber, default for new projects (default: playwright)'
		);
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
		console.log('    --port <n>         Local HTTP port the node listens on (default: 9001)');
		console.log('    --token <secret>   Auth token (auto-generated + saved if omitted)');
		console.log(
			'    --node-secret <s> Primary’s PLUM_NODE_SECRET (co-located: read automatically)'
		);
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('    --boot | --no-boot Start (or stop starting) this node when the machine boots');
		console.log('  node list            List this machine’s nodes and their status');
		console.log('  node restart [name]  Stop, refresh deps, and restart a node');
		console.log('  node stop [name]     Stop a node');
		console.log(
			'  node delete [name]   Stop it, remove its config, unregister it. No name: all nodes here'
		);
		console.log(
			'  node reconfig [name] Re-enter a node’s settings and re-register, without starting'
		);
		console.log('  manage-nodes         Open the node management menu');
		console.log(
			'    --primary <url>    Primary server URL (default: saved config or localhost:3001)'
		);
		console.log(
			'    --node-secret <s> PLUM_NODE_SECRET (auto-read on the server host; else prompts)'
		);
		console.log('    @tag               Run only tests matching a tag');
		console.log('    --parallel <n>     Run across n parallel workers');
		console.log('    --browser <name>   chromium | firefox (default: chromium)');
		console.log('  create-step          Interactively scaffold a new step definition');
		console.log(
			'  create-test          Scaffold a new test. --page adds a page object, --name skips prompts'
		);
		console.log('\n--------------------------------------\n');
}
