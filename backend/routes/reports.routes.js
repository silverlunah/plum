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

/* -----------------------------------------------------
 *                    Get Reports
 *  Description:
 * 		Get all reports from reports/
 * ------------------------------------------------------ */
router.get('/', (req, res) => {
	const reports = reportService.getAllReports();
	res.json({ reports });
});

/* -----------------------------------------------------
 *                  Get Latest Report
 *  Description:
 * 		Get latest report
 * ------------------------------------------------------ */
router.get('/latest', (req, res) => {
	const latestReport = reportService.getLatestReport();
	res.json({ latestReport });
});

module.exports = router;
