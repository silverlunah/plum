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
const path = require('path');
const { Server } = require('socket.io');
const app = require('./app');
const {
	ensureTestsDir,
	attachListenRetry,
	wireRealtimeServices,
	initCronServices,
	bootstrapMcpKey,
	onServerListening
} = require('./lib/serverBootstrap');

// Runner nodes receive their test files from dispatched jobs; the main
// server expects them to already be mounted on disk.
const testsDir = path.resolve(process.cwd(), 'tests');

// Node/runner mode strips out everything that only makes sense on the main
// server (cron, MCP, socket.io, file watching).
const isNodeMode = process.env.PLUM_MODE === 'node';

const port = parseInt(process.env.PORT || '3001', 10);

// The underlying HTTP server, shared by Express and Socket.io.
const server = http.createServer(app);

// Real-time transport for live test output, screenshots, and run status.
const io = new Server(server, { cors: { origin: '*' } });

async function start() {
	// Confirm the tests directory is in place before doing anything else.
	ensureTestsDir(testsDir, isNodeMode);

	// Survive the brief EADDRINUSE window a self-restart can hit.
	attachListenRetry(server, port);

	// Connect socket.io to the runner/cron services (a no-op in node mode).
	const { cronService, backupCronService } = wireRealtimeServices(io, isNodeMode);

	// Start the scheduled test and backup cron jobs.
	await initCronServices(cronService, backupCronService);

	// Load the saved MCP API key into the environment for the MCP server.
	await bootstrapMcpKey(isNodeMode);

	// Begin accepting connections, then run mode-specific startup work.
	server.listen(port, () => onServerListening({ port, io, testsDir, isNodeMode }));
}

start().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
