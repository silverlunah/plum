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
		console.log('🟣  Initializing Plum...\n');

		if (fs.existsSync(userTestsPath)) {
			console.log('⚠️  A `tests/` folder already exists.\n');
		} else {
			console.log('📦 Creating test scaffold...\n');
			fse.copySync(scaffoldTestsPath, userTestsPath);
			console.log('✅ `tests/` initialized with example files.\n');
		}

		// Create .env file with default values
		createEnvFile();
		console.log(
			'🟣  Plum is now ready!\n\n Scaffold test cases are included in the `tests/` folder.\n For more information about Cucumber, visit: https://cucumber.io/\n\n - To start the server, run:\n `plum start` \n\n - If you are developing locally, run:\n `plum local <@tag/blank if you want to run all tests>`'
		);
		console.log('--------------------------------------\n');
		break;

	case 'start':
		console.log('--------------------------------------\n');

		// Initialize project
		console.log('🚀 Initializing plum...');
		execSync('npm run init', {
			cwd: plumRoot,
			stdio: 'inherit'
		});

		console.log('--------------------------------------\n');

		console.log('🚀 Running plum via Docker Compose...');

		// Copy .env file from root to backend
		copyEnvFile();

		// Convert Windows paths to safe format
		const userTestsAbs = path.resolve(process.cwd(), 'tests').replace(/\\/g, '/');
		const userModulesAbs = path.resolve(process.cwd(), 'node_modules').replace(/\\/g, '/');

		// Generate docker-compose.override.yml
		const overrideYAML = [
			'services:',
			'  backend:',
			'    volumes:',
			`      - "${userTestsAbs}:/app/tests"`,
			`      - "${userModulesAbs}:/app/tests/node_modules"`
		].join('\n');

		fs.writeFileSync(overrideFilePath, overrideYAML + '\n', 'utf8');
		console.log('✅ docker-compose.override.yml written');

		// Run docker compose
		execSync('docker compose up', {
			cwd: plumRoot,
			stdio: 'inherit'
		});
		console.log('--------------------------------------\n');
		break;

	case 'local': {
		console.log('--------------------------------------\n');
		console.log('🚀 Running Plum locally...');

		// Copy .env file from root to backend
		copyEnvFile();

		const tagArg = process.argv[3]; // This is your tag, like @test-1
		const userTestsPath = path.resolve(process.cwd(), 'tests');
		const backendTestsPath = path.join(plumRoot, 'backend', 'tests');

		// Copy user tests into backend
		if (fs.existsSync(userTestsPath)) {
			console.log('📦 Syncing your tests...');
			fse.copySync(userTestsPath, backendTestsPath);
		} else {
			console.log('⚠️  No `tests/` folder found in the user directory.');
		}

		// Run npm install
		console.log('--------------------------------------\n');
		console.log('Running `npm install`...');

		execSync('npm install', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit'
		});

		console.log('Running `npx playwright install`...');

		execSync('npx playwright install', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit'
		});

		// Run the tests with the tag filter, only if a tag is provided
		console.log('--------------------------------------\n');
		console.log('Running `npm run test` with:');
		console.log('TAG =', tagArg ?? '');
		console.log('TRIGGER =', 'command-line-trigger');

		execSync('npm run test', {
			cwd: path.join(plumRoot, 'backend'),
			stdio: 'inherit',
			env: {
				...process.env,
				TAG: tagArg ?? '',
				TRIGGER: 'command-line-trigger'
			}
		});
		console.log('--------------------------------------\n');
		break;
	}

	default:
		console.log('--------------------------------------\n');
		console.log('Usage: plum <init|start|local>');
		console.log('--------------------------------------\n');
}
