/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const AUTH_SCHEME = Object.freeze({
	BEARER: 'Bearer',
	API_KEY: 'ApiKey'
});

/** Builds the Authorization header for an outbound request to a runner node. */
function bearerHeader(token) {
	return { Authorization: `${AUTH_SCHEME.BEARER} ${token}` };
}

module.exports = { AUTH_SCHEME, bearerHeader };
