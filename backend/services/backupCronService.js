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

const cron = require('node-cron');
const prisma = require('./prisma');
const backupService = require('./backupService');

let scheduledJob = null;

const runBackup = async () => {
	let project;
	try {
		project = await prisma.project.findUnique({ where: { id: 1 } });
	} catch (err) {
		console.error('❌ Backup: could not read project config:', err.message);
		return;
	}

	if (!project?.backupEnabled) return;

	try {
		const data = await backupService.exportAll();
		const key = await backupService.uploadToS3(data, project);

		await prisma.project.update({
			where: { id: 1 },
			data: {
				backupLastRunAt: new Date(),
				backupLastStatus: `success:${key}`
			}
		});
		console.log(`✅ Backup uploaded: ${key}`);
	} catch (err) {
		console.error('❌ Backup failed:', err.message);
		try {
			await prisma.project.update({
				where: { id: 1 },
				data: {
					backupLastRunAt: new Date(),
					backupLastStatus: `error:${err.message}`
				}
			});
		} catch {}
	}
};

const schedule = (cronExpr, enabled) => {
	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}
	if (!enabled || !cronExpr || !cron.validate(cronExpr)) return;
	scheduledJob = cron.schedule(cronExpr, runBackup);
	console.log(`⏰ Backup scheduled: ${cronExpr}`);
};

const init = async () => {
	try {
		const project = await prisma.project.findUnique({ where: { id: 1 } });
		schedule(project?.backupCron, project?.backupEnabled);
	} catch (err) {
		console.error('Failed to initialize backup cron:', err.message);
	}
};

const reload = init;

module.exports = { init, reload, runBackup };
