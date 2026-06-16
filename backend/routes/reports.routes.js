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
	} catch {
		res.status(500).json({ error: 'Failed to fetch reports' });
	}
});

router.get('/latest', async (req, res) => {
	try {
		const latestReportId = await reportService.getLatestReportId();
		res.json({ latestReportId });
	} catch {
		res.status(500).json({ error: 'Failed to fetch latest report' });
	}
});

router.get('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	const detail = await reportService.getReportDetail(id);
	if (!detail) return res.status(404).json({ error: 'Report not found' });
	res.json(detail);
});

router.delete('/bulk', async (req, res) => {
	const { ids } = req.body;
	if (!Array.isArray(ids) || ids.length === 0) {
		return res.status(400).json({ error: 'ids array required' });
	}
	const numericIds = ids.map(Number).filter((n) => !isNaN(n));
	if (numericIds.length === 0) return res.status(400).json({ error: 'No valid ids' });
	try {
		await reportService.deleteReports(numericIds);
		res.json({ deleted: numericIds.length });
	} catch {
		res.status(500).json({ error: 'Failed to delete reports' });
	}
});

router.delete('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	try {
		await reportService.deleteReport(id);
		res.json({ deleted: id });
	} catch {
		res.status(500).json({ error: 'Failed to delete report' });
	}
});

module.exports = router;
