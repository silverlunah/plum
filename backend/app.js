/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const { SCREENSHOTS_DIR } = require('./lib/reportFilename');
const { isNodeMode } = require('./constants/env');
const app = express();

app.use(cors({ origin: '*' }));
// Dispatching a run to a node ships the whole tests/ tree (base64-encoded,
// fixtures included) as one JSON body — Express's 100kb default 413s well
// before a real test suite does.
app.use(express.json({ limit: '500mb' }));

// Serve screenshot files written during report processing
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// Routes
const nodeRoutes = require('./routes/node.routes');
app.use('/api', nodeRoutes);

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
	app.use('/test-suites', require('./routes/test-suites.routes'));
	app.use('/test-cases', require('./routes/test-cases.routes'));
	app.use('/test-runs', require('./routes/test-runs.routes'));
	app.use('/trigger', require('./routes/trigger.routes'));
}

// Global JSON error handler — Express's default sends HTML, which breaks JSON clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error(err);
	res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
