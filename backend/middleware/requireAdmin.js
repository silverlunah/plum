/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

function requireAdmin(req, res, next) {
	if (req.user?.role !== 'admin') {
		return res.status(403).json({ error: 'Admin access required' });
	}
	next();
}

module.exports = { requireAdmin };
