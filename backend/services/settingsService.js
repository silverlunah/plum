/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const prisma = require('./prisma');

// Raw accessor — includes the mcpKey secret. Only for internal use by this
// file's own functions and other trusted internal callers. Never expose this
// return value directly over HTTP.
const getProjectRaw = async (projectId) => {
	return prisma.project.findUnique({ where: { id: projectId } });
};

// The single organisation. Raw accessor includes backupS3SecretKey — only for
// internal callers (e.g. backup.routes.js needs the real secret for a
// connection test). Never expose it directly over HTTP.
const getOrgRaw = async () => {
	return prisma.organization.findFirst({ orderBy: { id: 'asc' } });
};

// Public accessor — strips secret fields. This is what routes should use.
const getProject = async (projectId) => {
	const { mcpKey, ...safe } = await getProjectRaw(projectId);
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
		// re-schedule this project's jobs for the new offset to take effect.
		await require('./cronService').reload();
	}

	const { mcpKey, ...safe } = project;
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
	getOrgRaw,
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
