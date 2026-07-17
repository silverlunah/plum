/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/** Value of PLUM_MODE when this process is a runner node, not the primary server. */
const PLUM_MODE_NODE = 'node';

/** Fallback port for the Express server when PORT is unset. */
const DEFAULT_PORT = '3001';

function isNodeMode() {
	return process.env.PLUM_MODE === PLUM_MODE_NODE;
}

module.exports = { PLUM_MODE_NODE, DEFAULT_PORT, isNodeMode };
