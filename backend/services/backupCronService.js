/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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

const schedule = (cronExpr, enabled, timezone) => {
	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}
	if (!enabled || !cronExpr || !cron.validate(cronExpr)) return;
	scheduledJob = cron.schedule(cronExpr, runBackup, { timezone: timezone || 'UTC' });
	console.log(`⏰ Backup scheduled: ${cronExpr} (${timezone || 'UTC'})`);
};

const init = async () => {
	try {
		const project = await prisma.project.findUnique({ where: { id: 1 } });
		schedule(project?.backupCron, project?.backupEnabled, project?.timezone);
	} catch (err) {
		console.error('Failed to initialize backup cron:', err.message);
	}
};

const reload = init;

module.exports = { init, reload, runBackup };
