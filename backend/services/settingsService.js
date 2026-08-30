/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const prisma = require('./prisma');

const getProjectRaw = async (projectId) => {
	return prisma.project.findUnique({ where: { id: projectId } });
};

// The single organisation. Raw accessor includes backupS3SecretKey — only for
// internal callers (e.g. backup.routes.js needs the real secret for a
// connection test). Never expose it directly over HTTP.
const getOrgRaw = async () => {
	return prisma.organization.findFirst({ orderBy: { id: 'asc' } });
};

const getProject = async (projectId) => {
	return getProjectRaw(projectId);
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
		// Cron jobs read the timezone at schedule time. reload() re-schedules every
		// project's jobs — coarse, but there's no per-project reload.
		await require('./cronService').reload();
	}

	return project;
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

const getBackupConfig = async () => {
	const org = await getOrgRaw();
	return {
		timezone: org.timezone,
		backupEnabled: org.backupEnabled,
		backupCron: org.backupCron,
		backupS3Endpoint: org.backupS3Endpoint,
		backupS3Region: org.backupS3Region,
		backupS3Bucket: org.backupS3Bucket,
		backupS3AccessKey: org.backupS3AccessKey,
		backupS3SecretKeySet: org.backupS3SecretKey.length > 0,
		backupS3Prefix: org.backupS3Prefix,
		backupLastRunAt: org.backupLastRunAt,
		backupLastStatus: org.backupLastStatus,
		backupIncludeReports: org.backupIncludeReports
	};
};

const updateBackupConfig = async ({
	timezone,
	backupEnabled,
	backupCron,
	backupS3Endpoint,
	backupS3Region,
	backupS3Bucket,
	backupS3AccessKey,
	backupS3SecretKey,
	backupS3Prefix,
	backupIncludeReports
}) => {
	const org = await getOrgRaw();
	return prisma.organization.update({
		where: { id: org.id },
		data: {
			...(timezone !== undefined && { timezone }),
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

// This member's own MCP key for this project. The full key is shown so it can be
// copied; there's one per (project, user).
const getMcpConfig = async (projectId, userId) => {
	const row = await prisma.mcpKey.findUnique({
		where: { projectId_userId: { projectId, userId } },
		select: { key: true, createdAt: true }
	});
	return { mcpKeySet: !!row, mcpKey: row?.key ?? '', createdAt: row?.createdAt ?? null };
};

const generateMcpKey = async (projectId, userId) => {
	const key = crypto.randomBytes(32).toString('hex');
	await prisma.mcpKey.upsert({
		where: { projectId_userId: { projectId, userId } },
		create: { projectId, userId, key },
		update: { key, createdAt: new Date() }
	});
	return { mcpKey: key };
};

const revokeMcpKey = async (projectId, userId) => {
	await prisma.mcpKey.deleteMany({ where: { projectId, userId } });
};

module.exports = {
	getProject,
	getProjectRaw,
	getOrgRaw,
	updateProject,
	getTestPrefixes,
	updateTestPrefixes,
	getWebhooks,
	updateWebhooks,
	getBackupConfig,
	updateBackupConfig,
	getMcpConfig,
	generateMcpKey,
	revokeMcpKey
};
