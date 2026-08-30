/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { resolveProjectId } = require('../lib/projectContext');
const { getContext } = require('../lib/requestContext');

// Runs after jwtAuth. Sets req.projectId to the project this request acts on,
// or 403s when the user can reach none.
async function requireProjectAccess(req, res, next) {
	try {
		const projectId = await resolveProjectId(req);
		if (!projectId) return res.status(403).json({ error: 'No project access' });
		req.projectId = projectId;
		const ctx = getContext();
		if (ctx) ctx.projectId = projectId;
		next();
	} catch (e) {
		next(e);
	}
}

module.exports = { requireProjectAccess };
