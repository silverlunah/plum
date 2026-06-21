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

const getProject = async () => {
	let project = await prisma.project.findUnique({ where: { id: 1 } });
	if (!project) {
		project = await prisma.project.create({ data: { id: 1 } });
	}
	return project;
};

const updateProject = async ({ name, logoUrl }) => {
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, name: name ?? '', logoUrl: logoUrl ?? '' },
		update: { name: name ?? '', logoUrl: logoUrl ?? '' }
	});
};

const getTestPrefixes = async () => {
	const project = await getProject();
	return { testCasePrefix: project.testCasePrefix, testSuitePrefix: project.testSuitePrefix };
};

const updateTestPrefixes = async ({ testCasePrefix, testSuitePrefix }) => {
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: {
			...(testCasePrefix !== undefined && { testCasePrefix }),
			...(testSuitePrefix !== undefined && { testSuitePrefix })
		}
	});
};

const getWebhooks = async () => {
	const project = await getProject();
	return {
		discordWebhookUrl: project.discordWebhookUrl ?? '',
		slackWebhookUrl: project.slackWebhookUrl ?? '',
		notifyPublicUrl: project.notifyPublicUrl ?? ''
	};
};

const updateWebhooks = async ({ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl }) => {
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1 },
		update: {
			discordWebhookUrl: discordWebhookUrl ?? '',
			slackWebhookUrl: slackWebhookUrl ?? '',
			notifyPublicUrl: notifyPublicUrl ?? ''
		}
	});
};

const getBackupConfig = async () => {
	const project = await getProject();
	return {
		backupEnabled: project.backupEnabled,
		backupCron: project.backupCron,
		backupS3Endpoint: project.backupS3Endpoint,
		backupS3Region: project.backupS3Region,
		backupS3Bucket: project.backupS3Bucket,
		backupS3AccessKey: project.backupS3AccessKey,
		backupS3SecretKeySet: project.backupS3SecretKey.length > 0,
		backupS3Prefix: project.backupS3Prefix,
		backupLastRunAt: project.backupLastRunAt,
		backupLastStatus: project.backupLastStatus
	};
};

const updateBackupConfig = async ({
	backupEnabled,
	backupCron,
	backupS3Endpoint,
	backupS3Region,
	backupS3Bucket,
	backupS3AccessKey,
	backupS3SecretKey,
	backupS3Prefix
}) => {
	const update = {
		...(backupEnabled !== undefined && { backupEnabled }),
		...(backupCron !== undefined && { backupCron }),
		...(backupS3Endpoint !== undefined && { backupS3Endpoint }),
		...(backupS3Region !== undefined && { backupS3Region }),
		...(backupS3Bucket !== undefined && { backupS3Bucket }),
		...(backupS3AccessKey !== undefined && { backupS3AccessKey }),
		...(backupS3SecretKey && { backupS3SecretKey }),
		...(backupS3Prefix !== undefined && { backupS3Prefix })
	};
	return prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, ...update },
		update
	});
};

module.exports = {
	getProject,
	updateProject,
	getTestPrefixes,
	updateTestPrefixes,
	getWebhooks,
	updateWebhooks,
	getBackupConfig,
	updateBackupConfig
};
