/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const cron = require('node-cron');
const prisma = require('./prisma');
const reportService = require('./reportService');

let scheduledJob = null;

// Reads Organization.reportRetentionDays fresh on every run, so a settings
// change takes effect on the next nightly pass without rescheduling.
const runPrune = async () => {
	try {
		const org = await prisma.organization.findFirst({ orderBy: { id: 'asc' } });
		const { count } = await reportService.pruneOldReports(org?.reportRetentionDays ?? 0);
		if (count > 0) console.log(`🧹 Pruned ${count} report${count === 1 ? '' : 's'}`);
	} catch (err) {
		console.error('❌ Report prune failed:', err.message);
	}
};

const init = async () => {
	if (scheduledJob) scheduledJob.stop();
	scheduledJob = cron.schedule('23 3 * * *', runPrune);
	await runPrune();
};

module.exports = { init, runPrune };
