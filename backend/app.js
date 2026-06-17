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

const path = require('path');
const express = require('express');
const cors = require('cors');
const { SCREENSHOTS_DIR } = require('./lib/reportFilename');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve screenshot files written during report processing
app.use('/screenshots', express.static(SCREENSHOTS_DIR));

// Routes
const nodeRoutes = require('./routes/node.routes');
app.use('/api', nodeRoutes);

// Primary-mode routes — skipped when running as a runner node (no DB available)
if (process.env.PLUM_MODE !== 'node') {
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
}

module.exports = app;
