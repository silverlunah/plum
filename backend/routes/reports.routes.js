/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');

router.get('/', async (req, res) => {
	try {
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 15));
		const result = await reportService.getReports({ page, limit });
		res.json(result);
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
