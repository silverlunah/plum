/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');
const exportService = require('../services/exportService');
const { sendExport, exportFormat } = require('../lib/exportResponse');
const { jwtAuth } = require('../middleware/jwtAuth');
const { requireProjectAccess } = require('../middleware/requireProjectAccess');

router.use(jwtAuth, requireProjectAccess);

router.get('/:id/export', async (req, res, next) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	try {
		const data = await exportService.buildReportExport(req.projectId, id);
		if (!data) return res.status(404).json({ error: 'Report not found' });
		await sendExport(res, {
			format: exportFormat(req),
			filenameBase: `report-${id}`,
			json: () => data,
			csv: () => exportService.reportCsv(data)
		});
	} catch (e) {
		next(e);
	}
});

router.get('/', async (req, res) => {
	try {
		const page = Math.max(1, parseInt(req.query.page) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 15));
		res.json(await reportService.getReports(req.projectId, { page, limit }));
	} catch {
		res.status(500).json({ error: 'Failed to fetch reports' });
	}
});

router.get('/latest', async (req, res) => {
	try {
		res.json({ latestReportId: await reportService.getLatestReportId(req.projectId) });
	} catch {
		res.status(500).json({ error: 'Failed to fetch latest report' });
	}
});

router.get('/:id/recordings', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	try {
		res.json(await reportService.getRecordings(req.projectId, id));
	} catch {
		res.status(500).json({ error: 'Failed to fetch recordings' });
	}
});

router.get('/:id/recordings/:recordingId/events', async (req, res) => {
	const recordingId = parseInt(req.params.recordingId, 10);
	if (isNaN(recordingId)) return res.status(400).json({ error: 'Invalid recording id' });
	try {
		const events = await reportService.getRecordingEvents(req.projectId, recordingId);
		if (!events) return res.status(404).json({ error: 'Recording not found' });
		res.json({ events });
	} catch {
		res.status(500).json({ error: 'Failed to fetch recording events' });
	}
});

router.get('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	const detail = await reportService.getReportDetail(req.projectId, id);
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
		await reportService.deleteReports(req.projectId, numericIds);
		res.json({ deleted: numericIds.length });
	} catch {
		res.status(500).json({ error: 'Failed to delete reports' });
	}
});

router.delete('/:id', async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (isNaN(id)) return res.status(400).json({ error: 'Invalid report id' });
	try {
		await reportService.deleteReport(req.projectId, id);
		res.json({ deleted: id });
	} catch {
		res.status(500).json({ error: 'Failed to delete report' });
	}
});

module.exports = router;
