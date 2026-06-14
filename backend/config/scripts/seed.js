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

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const CRON_JOBS_FILE = path.join(__dirname, '../cron-jobs.json');

async function seed() {
	if (!fs.existsSync(CRON_JOBS_FILE)) return;

	const prisma = new PrismaClient();
	try {
		const data = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf8'));
		let count = 0;
		for (const [taskName, { cronExpression, tags, workers }] of Object.entries(data)) {
			await prisma.cronJob.upsert({
				where: { taskName },
				create: { taskName, cronExpression, tags, workers: workers ?? 1 },
				update: {}
			});
			count++;
		}
		console.log(`✅ Seeded ${count} cron job(s) from cron-jobs.json`);
		fs.renameSync(CRON_JOBS_FILE, CRON_JOBS_FILE + '.bak');
	} catch (e) {
		console.error('Seed failed:', e.message);
	} finally {
		await prisma.$disconnect();
	}
}

seed();
