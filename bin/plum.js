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
	const plumEntries = ['.plum/', 'reports/'];
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

		// Create .vscode/settings.json and install Cucumber extension — only if VS Code is available
		{
			let vscodeAvailable = false;
			try {
				execSync('code --version', { stdio: 'ignore' });
				vscodeAvailable = true;
			} catch {}

			if (vscodeAvailable) {
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

				try {
					execSync('code --install-extension cucumberopen.cucumber-official', { stdio: 'inherit' });
					console.log('✅ Cucumber VS Code extension installed.\n');
				} catch {
					console.log(
						'⚠️  Could not install VS Code extension automatically. Install manually: cucumberopen.cucumber-official\n'
					);
				}
			} else {
				console.log('ℹ️  VS Code not detected — skipping .vscode setup.\n');
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
					'## Commands',
					'',
					'| Command | Description |',
					'|---|---|',
					'| `plum dev` | Run all tests locally |',
					'| `plum dev @tag` | Run tests matching a tag |',
					'| `plum dev --parallel N` | Run tests across N parallel workers |',
					'| `plum start` | Start the full UI via Docker (`http://localhost:5173`) |',
					'| `plum create-step` | Interactively generate a new step definition |',
					'',
					'## Configuration',
					'',
					'| File | Purpose |',
					'|---|---|',
					'| `.env` | Set `BASE_URL` and `IS_HEADLESS` |',
					'| `plum.plugins.json` | Add extra npm packages for your tests |',
					'',
					'## Test Structure',
					'',
					'```',
					'tests/',
					'  features/          — Gherkin .feature files',
					'  step_definitions/  — TypeScript step implementations',
					'  pages/             — Page Object Models',
					'  utils/             — Browser setup, hooks, helpers',
					'```',
					'',
					'Tags are used to filter which tests to run:',
					'',
					'```gherkin',
					'@suite-login',
					'Feature: Login',
					'',
					'  @test-login-1',
					'  Scenario: User can log in',
					'    Given I am on the login page',
					'    ...',
					'```',
					'',
					'```bash',
					'plum dev @test-login-1   # single scenario',
					'plum dev @suite-login    # whole suite',
					'```'
				].join('\n');
				fs.writeFileSync(userReadmePath, readmeContent + '\n', 'utf8');
				console.log('✅ README.md created with command reference.\n');
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

		// Copy config from package root to user's project dir so Docker can mount it
		const userConfigPath = path.join(process.cwd(), '.plum', 'config');
		fse.copySync(path.join(plumRoot, 'backend', 'config'), userConfigPath);

		// Convert Windows paths to safe format
		const userTestsAbs = path.resolve(process.cwd(), 'tests').replace(/\\/g, '/');
		const userReportsAbs = path.resolve(process.cwd(), 'reports').replace(/\\/g, '/');
		const userConfigAbs = userConfigPath.replace(/\\/g, '/');

		// Generate docker-compose.override.yml
		const overrideYAML = [
			'services:',
			'  backend:',
			'    volumes:',
			`      - "${userReportsAbs}:/app/reports"`,
			`      - "${userConfigAbs}:/app/config"`,
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

	case 'create-step': {
		const createStepScript = path.join(plumRoot, 'backend', 'config', 'scripts', 'create-step.mjs');
		execSync(`node ${createStepScript}`, {
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
		console.log('Usage: plum <init|start|dev|create-step>');
		console.log('--------------------------------------\n');
}
