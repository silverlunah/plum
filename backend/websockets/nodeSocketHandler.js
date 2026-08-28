/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const runnerService = require('../services/runnerService');
const nodeStreamRegistry = require('../services/nodeStreamRegistry');

// A separate namespace from the browser-facing default one — a node connects
// with its own runner token (the same credential it already uses to call back
// into the primary's HTTP control routes, see runnerService.isValidToken) and
// announces the jobId it's streaming for, which nodeStreamRegistry maps back
// to whichever dispatch call is waiting on it.
function nodeSocketHandler(io) {
	const nodeIo = io.of('/node-stream');

	nodeIo.use(async (socket, next) => {
		const token = socket.handshake.auth?.token;
		if (await runnerService.isValidToken(token)) return next();
		next(new Error('unauthorized'));
	});

	nodeIo.on('connection', (socket) => {
		let jobId = null;

		socket.on('join', (id) => {
			jobId = id;
		});

		socket.on('rrweb-batch', (batch) => {
			if (jobId) nodeStreamRegistry.getRelay(jobId)?.onRRwebBatch?.(batch);
		});

		socket.on('log', (text) => {
			if (jobId) nodeStreamRegistry.getRelay(jobId)?.onLog?.(text);
		});
	});
}

module.exports = nodeSocketHandler;
