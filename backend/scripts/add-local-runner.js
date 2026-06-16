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
 * Interactively registers a local node runner with the Plum primary server,
 * then starts the node server in the foreground.
 *
 * Usage:  node scripts/add-local-runner.js
 *    or:  npm run add-local-runner     (from the backend directory)
 */

const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue) {
	return new Promise((resolve) => {
		const hint = defaultValue ? ` (default: ${defaultValue})` : '';
		rl.question(`  ${question}${hint}: `, (answer) => {
			resolve(answer.trim() || defaultValue || '');
		});
	});
}

async function main() {
	console.log('\nRegister a local node runner with the Plum server');
	console.log('─'.repeat(51));
	console.log('The runner URL will use host.docker.internal so that');
	console.log('the Plum Docker container can reach your host machine.\n');

	const name = await ask('Runner name', 'local-node');
	const token = await ask('Node auth token (NODE_TOKEN)', process.env.NODE_TOKEN || 'test123');
	const port = await ask('Port the node will run on', '3002');
	const browser = await ask('Default browser (chromium/firefox/webkit)', 'chromium');
	const apiUrl = await ask('Plum server API URL', 'http://localhost:3001');

	rl.close();

	const nodeUrl = `http://host.docker.internal:${port}`;
	console.log(`\nRegistering "${name}" at ${nodeUrl} via ${apiUrl}...`);

	let res;
	try {
		res = await fetch(`${apiUrl}/runners`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, url: nodeUrl, token, browser })
		});
	} catch (e) {
		console.error(`\n✗ Could not reach Plum server at ${apiUrl}`);
		console.error(`  ${e.message}`);
		console.error('\nMake sure the Docker stack is running:');
		console.error('  docker compose up -d');
		process.exit(1);
	}

	const body = await res.json().catch(() => ({}));

	if (!res.ok) {
		console.error(`\n✗ Server returned HTTP ${res.status}`);
		if (body.error) console.error(`  ${body.error}`);
		process.exit(1);
	}

	if (body.error) {
		console.error('\n✗ Error:', body.error);
		process.exit(1);
	}

	const runner = body.runner;
	console.log(`\n✓ Runner "${runner.name}" registered (id: ${runner.id})`);
	console.log(`  URL:     ${runner.url}`);
	console.log(`  Token:   ${runner.token}`);
	console.log(`  Browser: ${runner.browser}`);
	console.log('\nStarting node server… (Ctrl+C to stop)\n');

	// Start the node server in the foreground — the script stays alive until the user kills it
	const serverPath = path.resolve(__dirname, '..', 'server.js');
	const child = spawn(process.execPath, [serverPath], {
		env: {
			...process.env,
			NODE_TOKEN: token,
			PLUM_MODE: 'node',
			PORT: port
		},
		stdio: 'inherit',
		cwd: path.resolve(__dirname, '..')
	});

	child.on('error', (e) => {
		console.error('✗ Failed to start node server:', e.message);
		process.exit(1);
	});

	child.on('close', (code) => {
		process.exit(code ?? 0);
	});
}

main().catch((e) => {
	rl.close();
	console.error('\n✗', e.message);
	process.exit(1);
});
