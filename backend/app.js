/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const cors = require('cors');
const { isNodeMode } = require('./constants/env');
const app = express();

// `*` is safe here, auth is a header token, not a cookie. Operators who still
// want the browser origin pinned can set PLUM_ALLOWED_ORIGINS (comma-separated).
const allowedOrigins = (process.env.PLUM_ALLOWED_ORIGINS || '')
	.split(',')
	.map((o) => o.trim())
	.filter(Boolean);
app.use(
	cors({
		origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
		exposedHeaders: ['Content-Disposition']
	})
);
app.use(express.json());

// Routes

// Node-only, these run caller-supplied test code; on the primary that's an
// unauthenticated RCE. The primary never serves its own /api/*.
//
// The large body limit lives here rather than globally: only a dispatched job
// uploads a whole tests folder, and a global limit would let an unauthenticated
// request buffer half a gigabyte on the primary.
if (isNodeMode()) {
	app.use('/api', express.json({ limit: '500mb' }), require('./routes/node.routes'));
}

// Primary-mode routes, skipped when running as a runner node (no DB available)
if (!isNodeMode()) {
	app.use('/tests', require('./routes/tests.routes'));
	app.use('/reports', require('./routes/reports.routes'));
	app.use('/cron-jobs', require('./routes/cron.routes'));
	app.use('/settings', require('./routes/settings.routes'));
	app.use('/backup', require('./routes/backup.routes'));
	app.use('/runners', require('./routes/runners.routes'));
	app.use('/auth', require('./routes/auth.routes'));
	app.use('/users', require('./routes/users.routes'));
	app.use('/projects', require('./routes/projects.routes'));
	app.use('/server', require('./routes/server.routes'));
	app.use('/test-suites', require('./routes/test-suites.routes'));
	app.use('/test-cases', require('./routes/test-cases.routes'));
	app.use('/test-runs', require('./routes/test-runs.routes'));
	app.use('/trigger', require('./routes/trigger.routes'));
	app.use('/active-runs', require('./routes/active-runs.routes'));
	app.use('/activity', require('./routes/activity.routes'));
	app.use('/mcp', require('./routes/mcp.routes'));
}

// Global JSON error handler, Express's default sends HTML, which breaks JSON clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error(err);
	// A Prisma error's message leaks query fragments, map it to something safe.
	// (Plain Errors from services are meant for the user and pass through below.)
	if (typeof err?.name === 'string' && err.name.startsWith('PrismaClient')) {
		if (err.code === 'P2002') {
			const t = err.meta?.target;
			const field = Array.isArray(t) ? t[t.length - 1] : typeof t === 'string' ? t : 'value';
			return res.status(409).json({ error: `That ${field} is already in use.` });
		}
		if (err.code === 'P2025') return res.status(404).json({ error: 'That item no longer exists.' });
		return res.status(400).json({ error: 'That change could not be saved.' });
	}
	res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
