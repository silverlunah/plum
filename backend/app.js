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

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
const testRoutes = require('./routes/tests.routes');
const reportRoutes = require('./routes/reports.routes');
const cronRoutes = require('./routes/cron.routes');
const scheduleRoutes = require('./routes/schedules.routes');
const settingsRoutes = require('./routes/settings.routes');
const backupRoutes = require('./routes/backup.routes');

app.use('/tests', testRoutes);
app.use('/reports', reportRoutes);
app.use('/cron-jobs', cronRoutes);
app.use('/reports', express.static('reports'));
app.use('/schedules', scheduleRoutes);
app.use('/settings', settingsRoutes);
app.use('/backup', backupRoutes);

module.exports = app;
