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

const prisma = require('./prisma');

const exportAll = async () => {
	const [cronJobs, project] = await Promise.all([
		prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } }),
		prisma.project.findUnique({ where: { id: 1 } })
	]);

	return {
		version: '1',
		exportedAt: new Date().toISOString(),
		cronJobs: cronJobs.map(({ id, createdAt, updatedAt, reports: _, ...r }) => r),
		project: project ? { name: project.name, logoUrl: project.logoUrl } : null
	};
};

const importAll = async ({ cronJobs = [], project = null }, cronService) => {
	await prisma.$transaction(async (tx) => {
		for (const job of cronJobs) {
			await tx.cronJob.upsert({
				where: { taskName: job.taskName },
				create: {
					taskName: job.taskName,
					cronExpression: job.cronExpression,
					tags: job.tags,
					workers: job.workers ?? 1
				},
				update: { cronExpression: job.cronExpression, tags: job.tags, workers: job.workers ?? 1 }
			});
		}

		if (project) {
			await tx.project.upsert({
				where: { id: 1 },
				create: { id: 1, name: project.name ?? '', logoUrl: project.logoUrl ?? '' },
				update: { name: project.name ?? '', logoUrl: project.logoUrl ?? '' }
			});
		}
	});

	if (cronService) await cronService.reload();
};

module.exports = { exportAll, importAll };
