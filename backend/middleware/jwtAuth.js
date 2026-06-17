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

const { verifyToken } = require('../services/userService');

function jwtAuth(req, res, next) {
	const auth = req.headers.authorization;
	if (!auth || !auth.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	try {
		req.user = verifyToken(auth.slice(7));
		next();
	} catch {
		return res.status(401).json({ error: 'Invalid or expired token' });
	}
}

module.exports = { jwtAuth };
