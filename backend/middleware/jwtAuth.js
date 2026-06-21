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
const prisma = require('../services/prisma');

function jwtAuth(req, res, next) {
	const auth = req.headers.authorization;

	// MCP API key — resolves to the first admin user so createdById is always valid
	const mcpKey = process.env.PLUM_MCP_KEY;
	if (mcpKey && auth === `ApiKey ${mcpKey}`) {
		prisma.user
			.findFirst({ where: { role: 'admin' }, select: { id: true } })
			.then((admin) => {
				req.user = { userId: admin?.id ?? null };
				next();
			})
			.catch(() => {
				req.user = { userId: null };
				next();
			});
		return;
	}

	if (!auth || !auth.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Unauthorized' });
	}
	let payload;
	try {
		payload = verifyToken(auth.slice(7));
	} catch {
		return res.status(401).json({ error: 'Invalid or expired token' });
	}
	// Confirm the user still exists — catches stale JWTs after a DB reset
	prisma.user
		.findUnique({ where: { id: payload.userId }, select: { id: true } })
		.then((user) => {
			if (!user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
			req.user = payload;
			next();
		})
		.catch(() => {
			req.user = payload;
			next();
		});
}

module.exports = { jwtAuth };
