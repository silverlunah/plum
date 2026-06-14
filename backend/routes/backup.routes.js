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
const router = express.Router();
const backupService = require('../services/backupService');
const cronService = require('../services/cronService');

router.get('/export', async (req, res) => {
	try {
		const data = await backupService.exportAll();
		const fileName = `plum-backup-${new Date().toISOString().slice(0, 10)}.json`;
		res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
		res.setHeader('Content-Type', 'application/json');
		res.json(data);
	} catch (error) {
		console.error('Export failed:', error);
		res.status(500).json({ error: 'Export failed' });
	}
});

router.post('/import', async (req, res) => {
	try {
		const { cronJobs, reports, project } = req.body;
		if (!Array.isArray(cronJobs) && !Array.isArray(reports) && !project) {
			return res.status(400).json({ error: 'Invalid backup format' });
		}
		await backupService.importAll({ cronJobs, reports, project }, cronService);
		res.json({ message: 'Import successful' });
	} catch (error) {
		console.error('Import failed:', error);
		res.status(500).json({ error: 'Import failed' });
	}
});

module.exports = router;
