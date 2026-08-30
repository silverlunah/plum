/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { ELEVATED_ROLES } = require('../constants/roles');

// Elevated (settings) access. Always paired with requireProjectAccess and run
// after it, so an admin only clears this for a project they're assigned to;
// an owner clears it everywhere.
function requireAdmin(req, res, next) {
	if (!ELEVATED_ROLES.includes(req.user?.role)) {
		return res.status(403).json({ error: 'Admin access required' });
	}
	next();
}

module.exports = { requireAdmin };
