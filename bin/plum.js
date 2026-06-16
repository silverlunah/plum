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

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fse from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

	// Check if .env file already exists
	if (fs.existsSync(envFilePath)) {
		copyEnvFile();
		console.log('⚠️ .env file already exists. Syncing .env file...\n');
		return; // Exit if file exists
	}

	// Default content for .env file
	const envContent = `BASE_URL=https://www.saucedemo.com/v1/
IS_HEADLESS=false
`;

	// Write the content to the .env file
	fs.writeFileSync(envFilePath, envContent, 'utf8');
	console.log('✅ .env file created with default values.\n');
}

// Scaffold plum.plugins.json if it doesn't exist yet
function scaffoldPluginsFile() {
	const pluginsPath = path.join(process.cwd(), 'plum.plugins.json');
	if (fs.existsSync(pluginsPath)) {
		console.log('⚠️  plum.plugins.json already exists. Skipping.\n');
		return;
	}
	const content = {
		'//': 'Add npm packages your tests depend on. Plum installs them automatically before each run.',
		'// example':
			'To add a package: put its name and version under "dependencies", e.g. "@faker-js/faker": "^9.0.0"',
		dependencies: {}
	};
	fs.writeFileSync(pluginsPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
	console.log('✅ plum.plugins.json created. Add npm packages here to extend your tests.\n');
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
	const plumEntries = ['reports/'];
	const plumBlock = `\n# Plum (auto-generated)\n${plumEntries.join('\n')}\n`;

	if (!fs.existsSync(gitignorePath)) {
		fs.writeFileSync(gitignorePath, plumBlock.trimStart(), 'utf8');
		console.log('✅ .gitignore created with Plum entries.\n');
		return;
	}

	const existing = fs.readFileSync(gitignorePath, 'utf8');
	const missing = plumEntries.filter((e) => !existing.includes(e));
	if (missing.length === 0) {
		console.log('⚠️  .gitignore already contains Plum entries. Skipping.\n');
		return;
	}

	fs.appendFileSync(gitignorePath, `\n# Plum (auto-generated)\n${missing.join('\n')}\n`);
	console.log('✅ .gitignore updated with Plum entries.\n');
}

// Function to copy .env file from root to backend
function copyEnvFile() {
	try {
		if (fs.existsSync(rootEnvPath)) {
			fse.copySync(rootEnvPath, backendEnvPath);
			console.log('📦 .env file copied to the backend folder.\n');
		} else {
			console.log('⚠️ .env file not found in the root directory.\n');
		}
	} catch (err) {
		console.error('Error copying .env file:', err);
	}
}

/* -----------------------------------------------------
 *                    Commands
 *  Description:
 * 		Main command line interface for Plum. Use
 * 		"plum <command>" to run the desired command.
 * ------------------------------------------------------ */
switch (command) {
	case 'init':
		console.log('--------------------------------------\n');
		console.log('🟣  Preparing Plum...\n');

		if (fs.existsSync(userTestsPath)) {
			console.log('⚠️  A `tests/` folder already exists.\n');
		} else {
			console.log('📦 Creating test scaffold...\n');
			fse.copySync(scaffoldTestsPath, userTestsPath);
			console.log('✅ `tests/` initialized with example files.\n');
		}

		// Create .env file with default values
		createEnvFile();

		// Create or update .gitignore with Plum-generated paths
		ensureGitignore();

		// Scaffold plum.plugins.json for user-managed dependencies
		scaffoldPluginsFile();

		// Always create .vscode/settings.json for Cucumber extension config
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
				console.log('✅ .vscode/settings.json created for Cucumber extension.\n');
			} else {
				console.log('⚠️  .vscode/settings.json already exists. Skipping.\n');
			}

			// Install extension via CLI only when the code command is available
			try {
				execSync('code --version', { stdio: 'ignore' });
				try {
					execSync('code --install-extension cucumberopen.cucumber-official', { stdio: 'inherit' });
					console.log('✅ Cucumber VS Code extension installed.\n');
				} catch {
					console.log(
						'⚠️  Could not install VS Code extension automatically. Install manually: cucumberopen.cucumber-official\n'
					);
				}
			} catch {
				console.log(
					'ℹ️  Install the Cucumber VS Code extension manually: cucumberopen.cucumber-official\n'
				);
			}
		}

		// Scaffold tsconfig.json so VS Code resolves Plum's types without a local node_modules
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
				console.log('✅ tsconfig.json created for IDE type resolution.\n');
			} else {
				console.log('⚠️  tsconfig.json already exists. Skipping.\n');
			}
		}

		// Create README.md in user's project if one doesn't exist
		{
			const userReadmePath = path.join(process.cwd(), 'README.md');
			if (!fs.existsSync(userReadmePath)) {
				const readmeContent = [
					'# My Tests',
					'',
					'Powered by [Plum](https://github.com/silverlunah/plum) — Playwright + Cucumber.',
					'',
					'## Getting Started',
					'',
					"Your project is ready. Here's what to do next:",
					'',
					"1. **Open `.env`** and set `BASE_URL` to your application's URL.",
					'2. **Run the example tests** to confirm everything works:',
					'   ```bash',
					'   plum dev',
					'   ```',
					'3. **Write your first test** — edit a file in `tests/features/` or generate a step:',
					'   ```bash',
					'   plum create-step',
					'   ```',
					'4. **Start the full UI** (requires Docker) to trigger tests and view reports in the browser:',
					'   ```bash',
					'   plum start',
					'   ```',
					'   Then open **http://localhost:5173**.',
					'',
					'---',
					'',
					'## Commands',
					'',
					'| Command | Description |',
					'| --- | --- |',
					'| `plum dev` | Run all tests locally |',
					'| `plum dev @tag` | Run tests matching a tag |',
					'| `plum dev --parallel N` | Run tests across N parallel workers |',
					'| `plum start` | Start the full UI via Docker |',
					'| `plum stop` | Stop the server |',
					'| `plum create-step` | Interactively generate a new step definition |',
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
					'plum dev @test-login-1   # run a single scenario',
					'plum dev @suite-login    # run the whole suite',
					'```',
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
				console.log('✅ README.md created with quick-start guide.\n');
			} else {
				console.log('⚠️  README.md already exists. Skipping.\n');
			}
		}

		// Initialize project
		console.log('--------------------------------------\n');
		console.log('🚀 Initializing Plum...');
		execSync('npm run init', {
			cwd: plumRoot,
			stdio: 'inherit'
		});

		console.log(
			'🟣  Plum is now ready!\n\n Scaffold test cases are in `tests/`.\n Add extra npm packages to `plum.plugins.json`.\n\n - Run tests locally:\n   `plum dev` or `plum dev @tag`\n\n - Start the full UI (requires Docker):\n   `plum start`\n\n - Generate a step:\n   `plum create-step`'
		);
		console.log('--------------------------------------\n');
		break;

	case 'server':
		if (subcommand === 'stop') {
			console.log('--------------------------------------\n');
			console.log('🛑 Stopping Plum server...');
			execSync('docker compose down', { cwd: plumRoot, stdio: 'inherit' });
			console.log('✅ Plum server stopped. Your data is preserved.\n');
			console.log('--------------------------------------\n');
			break;
		}
	// fall through to start for 'plum server start' or 'plum server'
	// intentional fall-through

	case 'start':
		console.log('--------------------------------------\n');

		console.log('🚀 Running Plum via Docker Compose...');

		// Copy .env file from root to backend
		copyEnvFile();

		// Merge user plugins into backend/package.json before Docker build
		{
			const userPluginsPath = path.join(process.cwd(), 'plum.plugins.json');
			if (fs.existsSync(userPluginsPath)) {
				try {
					const userPlugins = JSON.parse(fs.readFileSync(userPluginsPath, 'utf8'));
					const backendPkgPath = path.join(plumRoot, 'backend', 'package.json');
					const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
					const pluginDeps = userPlugins.dependencies ?? {};
					if (Object.keys(pluginDeps).length > 0) {
						backendPkg.dependencies = { ...backendPkg.dependencies, ...pluginDeps };
						fs.writeFileSync(backendPkgPath, JSON.stringify(backendPkg, null, '\t') + '\n', 'utf8');
						console.log(`📦 Merged plugins into backend: ${Object.keys(pluginDeps).join(', ')}\n`);
					}
				} catch {
					console.log('⚠️  Could not read plum.plugins.json. Skipping plugin merge.\n');
				}
			}
		}

		// Convert Windows paths to safe format
		const userTestsAbs = path.resolve(process.cwd(), 'tests').replace(/\\/g, '/');
		const userReportsAbs = path.resolve(process.cwd(), 'reports').replace(/\\/g, '/');

		// Generate docker-compose.override.yml
		// Config is served from the plum installation's backend/config directly via docker-compose.yml
		const overrideYAML = [
			'services:',
			'  backend:',
			'    volumes:',
			`      - "${userReportsAbs}:/app/reports"`,
			`      - "${userTestsAbs}:/app/tests"`
		].join('\n');

		fs.writeFileSync(overrideFilePath, overrideYAML + '\n', 'utf8');
		console.log('✅ docker-compose.override.yml written');

		// Run docker compose (--build picks up any plugin or config changes)
		execSync('docker compose up --build', {
			cwd: plumRoot,
			stdio: 'inherit'
		});
		console.log('--------------------------------------\n');
		break;

	case 'dev': {
		console.log('--------------------------------------\n');
		console.log('🚀 Running Plum in Development Mode...');

		// Copy .env file from root to backend
		copyEnvFile();

		const devArgs = process.argv.slice(3);
		const parallelIdx = devArgs.indexOf('--parallel');
		const parallelArg = parallelIdx !== -1 ? devArgs[parallelIdx + 1] : null;
		const tagArg = devArgs.find((a) => a.startsWith('@')) ?? null;
		const userTestsPath = path.resolve(process.cwd(), 'tests');
		const backendTestsPath = path.join(plumRoot, 'backend', 'tests');

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

		console.log('Running `npx playwright install`...');

		execSync('npx playwright install', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit'
		});

		// Run the tests with the tag filter, only if a tag is provided
		console.log('--------------------------------------\n');
		console.log('Running `npm run test` with:');
		console.log('TAG =', tagArg ?? '');
		console.log('PARALLEL =', parallelArg ?? 'off');
		console.log('TRIGGER =', 'command-line-trigger');

		execSync('npm run test', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit',
			env: {
				...process.env,
				TAG: tagArg ?? '',
				TRIGGER: 'command-line-trigger',
				...(parallelArg ? { PARALLEL: parallelArg } : {})
			}
		});
		console.log('--------------------------------------\n');
		break;
	}

	case 'stop':
		console.log('--------------------------------------\n');
		console.log('🛑 Stopping Plum...');
		execSync('docker compose down', {
			cwd: plumRoot,
			stdio: 'inherit'
		});
		console.log('✅ Plum stopped. Your data is preserved in the database volume.\n');
		console.log('--------------------------------------\n');
		break;

	case 'node': {
		if (subcommand === 'stop') {
			console.log('--------------------------------------\n');
			console.log('🛑 Stopping Plum node...');
			execSync('docker compose -f docker-compose.node.yml down', {
				cwd: plumRoot,
				stdio: 'inherit'
			});
			console.log('✅ Plum node stopped.\n');
			console.log('--------------------------------------\n');
			break;
		}

		// 'plum node start' — parse --token and --primary flags
		const nodeArgs = process.argv.slice(3);
		const tokenIdx = nodeArgs.indexOf('--token');
		const nodeToken = tokenIdx !== -1 ? nodeArgs[tokenIdx + 1] : process.env.NODE_TOKEN || '';
		const primaryIdx = nodeArgs.indexOf('--primary');
		const primaryUrl = primaryIdx !== -1 ? nodeArgs[primaryIdx + 1] : process.env.PRIMARY_URL || '';

		console.log('--------------------------------------\n');
		console.log('🚀 Starting Plum node (runner mode)...');
		if (!nodeToken) {
			console.log(
				'⚠️  No --token provided. The node will accept requests without authentication.\n'
			);
		}

		// Build override for node mode
		const userTestsAbs = path.resolve(process.cwd(), 'tests').replace(/\\/g, '/');
		const userReportsAbs = path.resolve(process.cwd(), 'reports').replace(/\\/g, '/');
		const nodeOverridePath = path.join(plumRoot, 'docker-compose.node-override.yml');

		const nodeOverride = [
			'services:',
			'  backend:',
			'    volumes:',
			`      - "${userReportsAbs}:/app/reports"`,
			`      - "${userTestsAbs}:/app/tests"`,
			'    environment:',
			`      NODE_TOKEN: "${nodeToken}"`,
			`      PRIMARY_URL: "${primaryUrl}"`,
			'      PLUM_MODE: "node"'
		].join('\n');

		fs.writeFileSync(nodeOverridePath, nodeOverride + '\n', 'utf8');

		copyEnvFile();

		execSync(
			'docker compose -f docker-compose.node.yml -f docker-compose.node-override.yml up --build',
			{
				cwd: plumRoot,
				stdio: 'inherit'
			}
		);
		console.log('--------------------------------------\n');
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

	default:
		console.log('--------------------------------------\n');
		console.log('Usage: plum <command>\n');
		console.log('  init                 Set up a new Plum project');
		console.log('  server start         Start the full UI stack via Docker  (alias: plum start)');
		console.log('  server stop          Stop the server  (alias: plum stop)');
		console.log('  node start           Start a runner node (no UI, receives remote jobs)');
		console.log('    --token <secret>   Auth token the primary must send');
		console.log('    --primary <url>    URL of the primary Plum server');
		console.log('  node stop            Stop the runner node');
		console.log('  dev                  Run tests locally without Docker');
		console.log('  create-step          Interactively scaffold a new step definition');
		console.log('\n--------------------------------------\n');
}
