/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const cors = require('cors');
const { isNodeMode } = require('./constants/env');
const app = express();

// `*` is safe here — auth is a header token, not a cookie. Operators who still
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
// Dispatching a run to a node ships the whole tests/ tree (base64-encoded,
// fixtures included) as one JSON body — Express's 100kb default 413s well
// before a real test suite does.
app.use(express.json({ limit: '500mb' }));

// Routes

// Node-only — these run caller-supplied test code; on the primary that's an
// unauthenticated RCE. The primary never serves its own /api/*.
if (isNodeMode()) {
	app.use('/api', require('./routes/node.routes'));
}

// Primary-mode routes — skipped when running as a runner node (no DB available)
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

// Global JSON error handler — Express's default sends HTML, which breaks JSON clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error(err);
	res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
