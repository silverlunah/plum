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
const scheduleService = require('../services/scheduleService');

/* -----------------------------------------------------
 *                    Get Schedules
 *  Description:
 * 		Get all schedules from schedules/
 * ------------------------------------------------------ */
router.get('/', (req, res) => {
	const schedules = scheduleService.getAllSchedules();
	res.json({ schedules });
});

module.exports = router;
