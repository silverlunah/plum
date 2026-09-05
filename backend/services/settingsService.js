/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const prisma = require('./prisma');
const activityService = require('./activityService');
const { ACTIVITY_ACTION, ACTIVITY_SCOPE } = require('../constants/activity');
const { sanitizeTestsPath } = require('../lib/sanitizeTestsPath');

const getProjectRaw = async (projectId) => {
	return prisma.project.findUnique({ where: { id: projectId } });
};

// Non-secret columns only: the raw row also carries the webhook URLs.
const projectPublicSelect = {
	id: true,
	name: true,
	logoUrl: true,
	timezone: true,
	maxRetries: true,
	defaultHome: true,
	manualRepositoryOnly: true,
	testsPath: true,
	// Read-only: surfaced so the UI can label the project, never accepted back.
	// updateProject() destructures an explicit allowlist, so adding it here
	// cannot make it writable: but do not add it to that destructure either.
	framework: true
};

// The single organisation. Raw accessor includes backupS3SecretKey, only for
// internal callers (e.g. backup.routes.js needs the real secret for a
// connection test). Never expose it directly over HTTP.
const getOrgRaw = async () => {
	return prisma.organization.findFirst({ orderBy: { id: 'asc' } });
};

const getProject = async (projectId) => {
	return prisma.project.findUnique({ where: { id: projectId }, select: projectPublicSelect });
};

const updateProject = async (
	projectId,
	{ name, logoUrl, timezone, maxRetries, defaultHome, manualRepositoryOnly, testsPath }
) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			...(name !== undefined && { name }),
			...(logoUrl !== undefined && { logoUrl }),
			...(timezone !== undefined && { timezone }),
			...(maxRetries !== undefined && { maxRetries: Number(maxRetries) || 0 }),
			...(defaultHome !== undefined && {
				defaultHome: defaultHome === 'repository' ? 'repository' : 'automated'
			}),
			...(manualRepositoryOnly !== undefined && {
				manualRepositoryOnly: Boolean(manualRepositoryOnly)
			}),
			...(testsPath !== undefined && { testsPath: sanitizeTestsPath(testsPath) })
		},
		select: projectPublicSelect
	});

	if (timezone !== undefined) {
		// Cron jobs read the timezone at schedule time. reload() re-schedules every
		// project's jobs: coarse, but there's no per-project reload.
		await require('./cronService').reload();
	}

	if (testsPath !== undefined) {
		// The path helpers read a cached map; refresh it, then re-derive which
		// cases are automated now that the feature files resolve elsewhere.
		await require('../lib/projectPaths').refresh();
		require('./reportService')
			.syncAutomatedFromTests(projectId)
			.catch(() => {});
	}

	await activityService.record(ACTIVITY_ACTION.PROJECT_SETTINGS_UPDATE, {
		projectId,
		target: { type: 'project', id: projectId, label: project.name }
	});
	return project;
};

const getTestPrefixes = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return { testCasePrefix: project.testCasePrefix, testSuitePrefix: project.testSuitePrefix };
};

// The route behind this is member-level, so the returned row must not carry the
// webhook URLs that GET /settings/integrations keeps behind an admin gate.
const updateTestPrefixes = async (projectId, { testCasePrefix, testSuitePrefix }) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			...(testCasePrefix !== undefined && { testCasePrefix }),
			...(testSuitePrefix !== undefined && { testSuitePrefix })
		},
		select: { id: true, name: true, testCasePrefix: true, testSuitePrefix: true }
	});
	await activityService.record(ACTIVITY_ACTION.PROJECT_PREFIXES_UPDATE, {
		projectId,
		target: { type: 'project', id: projectId, label: project.name },
		metadata: { testCasePrefix: project.testCasePrefix, testSuitePrefix: project.testSuitePrefix }
	});
	return project;
};

const getWebhooks = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return {
		discordWebhookUrl: project.discordWebhookUrl ?? '',
		slackWebhookUrl: project.slackWebhookUrl ?? ''
	};
};

const updateWebhooks = async (projectId, { discordWebhookUrl, slackWebhookUrl }) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			discordWebhookUrl: discordWebhookUrl ?? '',
			slackWebhookUrl: slackWebhookUrl ?? ''
		}
	});
	await activityService.record(ACTIVITY_ACTION.INTEGRATIONS_UPDATE, {
		projectId,
		target: { type: 'project', id: projectId, label: project.name },
		metadata: {
			discord: (discordWebhookUrl ?? '').length > 0,
			slack: (slackWebhookUrl ?? '').length > 0
		}
	});
	return project;
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
	const updated = await prisma.organization.update({
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
	await activityService.record(ACTIVITY_ACTION.BACKUP_CONFIG_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'backup', label: 'Backup configuration' },
		metadata: { enabled: updated.backupEnabled, cron: updated.backupCron }
	});
	return updated;
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
	await activityService.record(ACTIVITY_ACTION.MCP_KEY_GENERATE, {
		projectId,
		target: { type: 'mcp_key', id: userId, label: 'MCP key' }
	});
	return { mcpKey: key };
};

const getActivityRetention = async () => {
	const org = await getOrgRaw();
	return { activityRetentionDays: org.activityRetentionDays };
};

const getReportRetention = async () => {
	const org = await getOrgRaw();
	return { reportRetentionDays: org.reportRetentionDays };
};

const updateReportRetention = async (days) => {
	const org = await getOrgRaw();
	const updated = await prisma.organization.update({
		where: { id: org.id },
		data: { reportRetentionDays: Math.max(0, Number(days) || 0) }
	});
	await activityService.record(ACTIVITY_ACTION.REPORT_RETENTION_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'report', label: 'Report retention' },
		metadata: { days: updated.reportRetentionDays }
	});
	return { reportRetentionDays: updated.reportRetentionDays };
};

const getBuiltInRunnerEnabled = async () => {
	const org = await getOrgRaw();
	return { builtInRunnerEnabled: org.builtInRunnerEnabled };
};

const updateBuiltInRunnerEnabled = async (enabled) => {
	const org = await getOrgRaw();
	const updated = await prisma.organization.update({
		where: { id: org.id },
		data: { builtInRunnerEnabled: Boolean(enabled) }
	});
	await activityService.record(ACTIVITY_ACTION.NODE_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'node', label: 'Built-in runner' },
		metadata: { enabled: updated.builtInRunnerEnabled }
	});
	return { builtInRunnerEnabled: updated.builtInRunnerEnabled };
};

const updateActivityRetention = async (days) => {
	const org = await getOrgRaw();
	const updated = await prisma.organization.update({
		where: { id: org.id },
		data: { activityRetentionDays: Math.max(0, Number(days) || 0) }
	});
	await activityService.record(ACTIVITY_ACTION.ACTIVITY_RETENTION_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'activity', label: 'Activity log retention' },
		metadata: { days: updated.activityRetentionDays }
	});
	return { activityRetentionDays: updated.activityRetentionDays };
};

const revokeMcpKey = async (projectId, userId) => {
	const { count } = await prisma.mcpKey.deleteMany({ where: { projectId, userId } });
	if (count > 0) {
		await activityService.record(ACTIVITY_ACTION.MCP_KEY_REVOKE, {
			projectId,
			target: { type: 'mcp_key', id: userId, label: 'MCP key' }
		});
	}
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
	revokeMcpKey,
	getActivityRetention,
	updateActivityRetention,
	getReportRetention,
	updateReportRetention,
	getBuiltInRunnerEnabled,
	updateBuiltInRunnerEnabled
};
