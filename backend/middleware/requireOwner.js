/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { ROLE } = require('../constants/roles');

// Account-wide settings — user management, runners, backup, creating projects.
// Owner only; an admin's reach stops at its assigned projects.
function requireOwner(req, res, next) {
	if (req.user?.role !== ROLE.OWNER) {
		return res.status(403).json({ error: 'Owner access required' });
	}
	next();
}

module.exports = { requireOwner };
