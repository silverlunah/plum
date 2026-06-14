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

const { spawn } = require('child_process');

const socketHandler = (io) => {
	io.on('connection', (socket) => {
		console.log('WebSocket connection established');
		socket.on('run-test', (testID, workers) => {
			const tag = testID ? `${testID}` : '';
			const env = { ...process.env, TAG: tag, TRIGGER: 'manual-trigger' };
			if (workers && workers > 1) env.PARALLEL = String(workers);

			const testProcess = spawn('npm', ['run', 'test'], { env });

			testProcess.stdout.on('data', (data) => {
				socket.emit('log', data.toString());
			});

			testProcess.stderr.on('data', (data) => {
				socket.emit('log', `[ERROR] ${data.toString()}`);
			});

			testProcess.on('close', (code) => {
				socket.emit('log', `\nTest finished with code ${code}`);
				socket.emit('done', code);
			});
		});
	});
};

module.exports = socketHandler;
