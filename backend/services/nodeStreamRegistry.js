/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// In-memory jobId -> relay callbacks, so an incoming node socket (which only
// knows its own jobId) can find where to forward live rrweb/log events —
// registered by whichever dispatch call (socketHandler, cronService) started
// this job and already knows the browser-facing emit target/laneId.
const relays = new Map();

function registerRelay(jobId, { onRRwebBatch, onLog }) {
	relays.set(jobId, { onRRwebBatch, onLog });
}

function unregisterRelay(jobId) {
	relays.delete(jobId);
}

function getRelay(jobId) {
	return relays.get(jobId);
}

module.exports = { registerRelay, unregisterRelay, getRelay };
