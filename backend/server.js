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

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const socketHandler = require('./websockets/socketHandler.js');
const cronService = require('./services/cronService');
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const path = require('path');
const fs = require('fs');

// Always point to the mounted tests directory
const testsDir = path.resolve(process.cwd(), 'tests');

if (!fs.existsSync(testsDir)) {
	if (process.env.PLUM_MODE === 'node') {
		console.warn('⚠️  No tests folder found — will be populated when a job is received');
	} else {
		console.error('❌ No tests folder found at /app/tests');
		process.exit(1);
	}
} else {
	console.log('📂 Loading tests from:', testsDir);
}

const isNodeMode = process.env.PLUM_MODE === 'node';
const port = parseInt(process.env.PORT || '3001', 10);

socketHandler(io);
if (!isNodeMode) cronService.setSocketIO(io);

async function start() {
	if (!isNodeMode) await cronService.init();

	server.listen(port, async () => {
		console.log(`Backend running on port ${port}${isNodeMode ? ' (node/runner mode)' : ''}`);
		if (isNodeMode) return; // nodes don't watch files or schedule jobs

		// chokidar v5+ is ESM-only — use dynamic import to stay compatible with CJS
		let chokidar;
		try {
			chokidar = (await import('chokidar')).default;
		} catch {
			console.warn('⚠️  chokidar unavailable — file watching disabled');
			return;
		}

		const watchOpts = { usePolling: true, interval: 800, ignoreInitial: true };

		// Watch tests/features/ — notify UI when feature files are added/changed/removed
		const featuresDir = path.join(testsDir, 'features');
		if (fs.existsSync(featuresDir)) {
			let debounce = null;
			chokidar.watch(featuresDir, watchOpts).on('all', (event, filePath) => {
				clearTimeout(debounce);
				debounce = setTimeout(() => {
					console.log(
						`📝 Tests changed (${event}: ${path.basename(filePath)}) — notifying clients`
					);
					io.emit('tests-changed');
				}, 300);
			});
			console.log('👀 Watching for test file changes...');
		}

		// Watch reports/ — notify UI when a new report file lands
		const reportsDir = path.resolve(process.cwd(), 'reports');
		fs.mkdirSync(reportsDir, { recursive: true });
		chokidar.watch(reportsDir, { ...watchOpts, interval: 1200 }).on('add', (filePath) => {
			const name = path.basename(filePath);
			if ((name.startsWith('PASS_') || name.startsWith('FAIL_')) && name.endsWith('.json')) {
				console.log(`📊 New report: ${name} — notifying clients`);
				io.emit('report-ready');
			}
		});
		console.log('👀 Watching for new reports...');
	});
}

start().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
