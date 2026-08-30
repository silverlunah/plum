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
const getProjectRaw = async (projectId) => {
	return prisma.project.findUnique({ where: { id: projectId } });
};

// Instance-wide config (DB backup) lives on the first project.
const instanceProjectId = async () => {
	const p = await prisma.project.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
	return p?.id ?? null;
};

// Public accessor — strips secret fields. This is what routes should use.
const getProject = async (projectId) => {
	const { backupS3SecretKey, mcpKey, ...safe } = await getProjectRaw(projectId);
	return safe;
};

const updateProject = async (projectId, { name, logoUrl, timezone, baseUrl, maxRetries }) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			...(name !== undefined && { name }),
			...(logoUrl !== undefined && { logoUrl }),
			...(baseUrl !== undefined && { baseUrl }),
			...(timezone !== undefined && { timezone }),
			...(maxRetries !== undefined && { maxRetries: Number(maxRetries) || 0 })
		}
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

const getTestPrefixes = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return { testCasePrefix: project.testCasePrefix, testSuitePrefix: project.testSuitePrefix };
};

const updateTestPrefixes = async (projectId, { testCasePrefix, testSuitePrefix }) => {
	return prisma.project.update({
		where: { id: projectId },
		data: {
			...(testCasePrefix !== undefined && { testCasePrefix }),
			...(testSuitePrefix !== undefined && { testSuitePrefix })
		}
	});
};

const getWebhooks = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return {
		discordWebhookUrl: project.discordWebhookUrl ?? '',
		slackWebhookUrl: project.slackWebhookUrl ?? '',
		notifyPublicUrl: project.notifyPublicUrl ?? ''
	};
};

const updateWebhooks = async (
	projectId,
	{ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl }
) => {
	return prisma.project.update({
		where: { id: projectId },
		data: {
			discordWebhookUrl: discordWebhookUrl ?? '',
			slackWebhookUrl: slackWebhookUrl ?? '',
			notifyPublicUrl: notifyPublicUrl ?? ''
		}
	});
};

const getBackupConfig = async (projectId) => {
	const project = await getProjectRaw(projectId);
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
		backupLastStatus: project.backupLastStatus,
		backupIncludeReports: project.backupIncludeReports
	};
};

const updateBackupConfig = async (
	projectId,
	{
		backupEnabled,
		backupCron,
		backupS3Endpoint,
		backupS3Region,
		backupS3Bucket,
		backupS3AccessKey,
		backupS3SecretKey,
		backupS3Prefix,
		backupIncludeReports
	}
) => {
	return prisma.project.update({
		where: { id: projectId },
		data: {
			...(backupEnabled !== undefined && { backupEnabled }),
			...(backupCron !== undefined && { backupCron }),
			...(backupS3Endpoint !== undefined && { backupS3Endpoint }),
			...(backupS3Region !== undefined && { backupS3Region }),
			...(backupS3Bucket !== undefined && { backupS3Bucket }),
			...(backupS3AccessKey !== undefined && { backupS3AccessKey }),
			...(backupS3SecretKey && { backupS3SecretKey }),
			...(backupS3Prefix !== undefined && { backupS3Prefix }),
			...(backupIncludeReports !== undefined && { backupIncludeReports })
		}
	});
};

const getMcpConfig = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return { mcpKeySet: project.mcpKey.length > 0, mcpKey: project.mcpKey };
};

const generateMcpKey = async (projectId) => {
	const key = crypto.randomBytes(32).toString('hex');
	await prisma.project.update({ where: { id: projectId }, data: { mcpKey: key } });
	return { mcpKey: key };
};

module.exports = {
	getProject,
	getProjectRaw,
	instanceProjectId,
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
