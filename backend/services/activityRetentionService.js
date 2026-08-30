/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const cron = require('node-cron');
const prisma = require('./prisma');
const activityService = require('./activityService');

let scheduledJob = null;

// Reads Organization.activityRetentionDays fresh on every run, so a settings
// change takes effect on the next nightly pass without rescheduling.
const runPrune = async () => {
	try {
		const org = await prisma.organization.findFirst({ orderBy: { id: 'asc' } });
		const { count } = await activityService.prune(org?.activityRetentionDays ?? 90);
		if (count > 0) console.log(`🧹 Pruned ${count} activity log entr${count === 1 ? 'y' : 'ies'}`);
	} catch (err) {
		console.error('❌ Activity log prune failed:', err.message);
	}
};

const init = async () => {
	if (scheduledJob) scheduledJob.stop();
	scheduledJob = cron.schedule('17 3 * * *', runPrune);
	await runPrune();
};

module.exports = { init, runPrune };
