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
const reportService = require('../services/reportService');

router.get('/', async (req, res) => {
	try {
		const reports = await reportService.getAllReports();
		res.json({ reports });
	} catch (error) {
		console.error('Error fetching reports:', error);
		res.status(500).json({ error: 'Failed to fetch reports' });
	}
});

router.get('/latest', async (req, res) => {
	try {
		const latestReport = await reportService.getLatestReport();
		res.json({ latestReport });
	} catch (error) {
		console.error('Error fetching latest report:', error);
		res.status(500).json({ error: 'Failed to fetch latest report' });
	}
});

router.get('/:fileName/detail', (req, res) => {
	const detail = reportService.getReportDetail(req.params.fileName);
	if (!detail) return res.status(404).json({ error: 'Report not found' });
	res.json(detail);
});

module.exports = router;
