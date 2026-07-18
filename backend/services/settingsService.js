/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const prisma = require('./prisma');

// Raw accessor — includes secret fields (backupS3SecretKey, mcpKey). Only for
// internal use by this file's own functions and other trusted internal
// callers (e.g. backup.routes.js needs the real S3 secret for a connection
// test). Never expose this return value directly over HTTP.
const getProjectRaw = async () => {
	let project = await prisma.project.findUnique({ where: { id: 1 } });
	if (!project) {
		project = await prisma.project.create({ data: { id: 1 } });
	}
	return project;
};

// Public accessor — strips secret fields. This is what routes should use.
const getProject = async () => {
	const { backupS3SecretKey, mcpKey, ...safe } = await getProjectRaw();
	return safe;
};

const updateProject = async ({ name, logoUrl, timezone, maxRetries }) => {
	const data = {
		name: name ?? '',
		logoUrl: logoUrl ?? '',
		...(timezone !== undefined && { timezone }),
		...(maxRetries !== undefined && { maxRetries: Number(maxRetries) || 0 })
	};
	const project = await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, ...data },
		update: data
	});

	if (timezone !== undefined) {
		// Cron jobs read the timezone at schedule time, so a change here must
		// re-schedule everything for the new offset to take effect immediately.
		await require('./cronService').reload();
		await require('./backupCronService').reload();
	}

	const { backupS3SecretKey, mcpKey, ...safe } = project;
	return safe;
};

const getTestPrefixes = async () => {
	const project = await getProjectRaw();
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
	const project = await getProjectRaw();
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
	const project = await getProjectRaw();
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

const getMcpConfig = async () => {
	const project = await getProjectRaw();
	return { mcpKeySet: project.mcpKey.length > 0, mcpKey: project.mcpKey };
};

const generateMcpKey = async () => {
	const key = crypto.randomBytes(32).toString('hex');
	await prisma.project.upsert({
		where: { id: 1 },
		create: { id: 1, mcpKey: key },
		update: { mcpKey: key }
	});
	process.env.PLUM_MCP_KEY = key;
	return { mcpKey: key };
};

module.exports = {
	getProject,
	getProjectRaw,
	updateProject,
	getTestPrefixes,
	updateTestPrefixes,
	getWebhooks,
	updateWebhooks,
	getBackupConfig,
	updateBackupConfig,
	getMcpConfig,
	generateMcpKey
};
