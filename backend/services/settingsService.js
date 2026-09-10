/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const crypto = require('crypto');
const prisma = require('./prisma');
const activityService = require('./activityService');
const { ACTIVITY_ACTION, ACTIVITY_SCOPE } = require('../constants/activity');
const { isSessionMaxHours } = require('../constants/session');
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

// Owner view of the AI provider credentials. Never returns the keys themselves.
const getAiConfig = async () => {
	const org = await getOrgRaw();
	return {
		anthropicApiKeySet: org.anthropicApiKey !== '',
		anthropicModel: org.anthropicModel,
		openaiApiKeySet: org.openaiApiKey !== '',
		openaiModel: org.openaiModel
	};
};

const updateAiConfig = async ({ anthropicApiKey, anthropicModel, openaiApiKey, openaiModel }) => {
	const org = await getOrgRaw();
	const data = {};
	// Blank means "leave the stored key alone", matching the Google OAuth secret UI.
	if (anthropicApiKey) data.anthropicApiKey = String(anthropicApiKey).trim();
	if (anthropicModel !== undefined) data.anthropicModel = String(anthropicModel).trim();
	if (openaiApiKey) data.openaiApiKey = String(openaiApiKey).trim();
	if (openaiModel !== undefined) data.openaiModel = String(openaiModel).trim();

	await prisma.organization.update({ where: { id: org.id }, data });
	await activityService.record(ACTIVITY_ACTION.AI_CONFIG_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'ai', label: 'AI provider settings' },
		metadata: { changed: Object.keys(data) }
	});
	return getAiConfig();
};

// Owner view of the GitHub connection. Never returns the token itself.
const getGithubConfig = async () => {
	const org = await getOrgRaw();
	return { githubTokenSet: org.githubToken !== '' };
};

const updateGithubConfig = async ({ githubToken }) => {
	const org = await getOrgRaw();
	const data = {};
	if (githubToken) data.githubToken = String(githubToken).trim();

	await prisma.organization.update({ where: { id: org.id }, data });
	await activityService.record(ACTIVITY_ACTION.GITHUB_CONFIG_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'github', label: 'GitHub connection' },
		metadata: { changed: Object.keys(data) }
	});
	return getGithubConfig();
};

// Per-project AI behaviour, not a secret: what the agent is told about this
// project's tone and coding conventions.
const getProjectAiConfig = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return { aiSystemPrompt: project.aiSystemPrompt, aiCodePractices: project.aiCodePractices };
};

const updateProjectAiConfig = async (projectId, { aiSystemPrompt, aiCodePractices }) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			...(aiSystemPrompt !== undefined && { aiSystemPrompt: String(aiSystemPrompt) }),
			...(aiCodePractices !== undefined && { aiCodePractices: String(aiCodePractices) })
		},
		select: { id: true, name: true, aiSystemPrompt: true, aiCodePractices: true }
	});
	await activityService.record(ACTIVITY_ACTION.PROJECT_AI_CONFIG_UPDATE, {
		projectId,
		target: { type: 'project', id: projectId, label: project.name }
	});
	return { aiSystemPrompt: project.aiSystemPrompt, aiCodePractices: project.aiCodePractices };
};

// Per-project GitHub repo mapping, not a secret: which repo this project's
// tests live in. The credential that authenticates against it is org-wide,
// see getGithubConfig/updateGithubConfig above.
const getProjectGithubConfig = async (projectId) => {
	const project = await getProjectRaw(projectId);
	return {
		githubOwner: project.githubOwner,
		githubRepo: project.githubRepo,
		githubDefaultBranch: project.githubDefaultBranch
	};
};

const updateProjectGithubConfig = async (
	projectId,
	{ githubOwner, githubRepo, githubDefaultBranch }
) => {
	const project = await prisma.project.update({
		where: { id: projectId },
		data: {
			...(githubOwner !== undefined && { githubOwner: String(githubOwner).trim() }),
			...(githubRepo !== undefined && { githubRepo: String(githubRepo).trim() }),
			...(githubDefaultBranch !== undefined && {
				githubDefaultBranch: String(githubDefaultBranch).trim() || 'main'
			})
		},
		select: { id: true, name: true, githubOwner: true, githubRepo: true, githubDefaultBranch: true }
	});
	await activityService.record(ACTIVITY_ACTION.PROJECT_GITHUB_CONFIG_UPDATE, {
		projectId,
		target: { type: 'project', id: projectId, label: project.name }
	});
	return {
		githubOwner: project.githubOwner,
		githubRepo: project.githubRepo,
		githubDefaultBranch: project.githubDefaultBranch
	};
};

// Owner view. Never returns googleClientSecret, only whether one is set.
const getOrganization = async () => {
	const org = await getOrgRaw();
	return {
		name: org.name,
		logoUrl: org.logoUrl,
		sessionMaxHours: org.sessionMaxHours,
		passwordLoginEnabled: org.passwordLoginEnabled,
		googleLoginEnabled: org.googleLoginEnabled,
		googleClientId: org.googleClientId,
		googleClientSecretSet: org.googleClientSecret !== ''
	};
};

// Unauthenticated: what the login screen needs to render itself, and nothing
// that would help an attacker (no client id/secret).
const getPublicBranding = async () => {
	const org = await prisma.organization.findFirst({
		orderBy: { id: 'asc' },
		select: {
			name: true,
			logoUrl: true,
			passwordLoginEnabled: true,
			googleLoginEnabled: true
		}
	});
	return {
		name: org?.name ?? '',
		logoUrl: org?.logoUrl ?? '',
		// No org row yet (first-run) → only password login, so setup can proceed.
		passwordLoginEnabled: org?.passwordLoginEnabled ?? true,
		googleLoginEnabled: org?.googleLoginEnabled ?? false
	};
};

// The raw Google OAuth credentials, for the auth flow only. Never goes near a route.
const getGoogleOAuthConfig = async () => {
	const org = await getOrgRaw();
	return {
		enabled: org.googleLoginEnabled,
		clientId: org.googleClientId,
		clientSecret: org.googleClientSecret
	};
};

const updateOrganization = async ({
	name,
	logoUrl,
	sessionMaxHours,
	passwordLoginEnabled,
	googleLoginEnabled,
	googleClientId,
	googleClientSecret
}) => {
	const org = await getOrgRaw();
	const data = {};
	if (name !== undefined) data.name = String(name).trim();
	if (logoUrl !== undefined) data.logoUrl = String(logoUrl).trim();
	if (sessionMaxHours !== undefined) {
		if (!isSessionMaxHours(sessionMaxHours)) {
			const e = new Error('sessionMaxHours must be one of 6, 12, 18 or 24');
			e.status = 400;
			throw e;
		}
		data.sessionMaxHours = Number(sessionMaxHours);
	}
	if (googleClientId !== undefined) data.googleClientId = String(googleClientId).trim();
	// Blank means "leave the stored secret alone", matching the UI's placeholder.
	if (googleClientSecret) data.googleClientSecret = String(googleClientSecret).trim();
	if (passwordLoginEnabled !== undefined) data.passwordLoginEnabled = Boolean(passwordLoginEnabled);
	if (googleLoginEnabled !== undefined) data.googleLoginEnabled = Boolean(googleLoginEnabled);

	const next = { ...org, ...data };
	if (!next.passwordLoginEnabled && !next.googleLoginEnabled) {
		const e = new Error('At least one sign-in method must stay enabled.');
		e.status = 400;
		throw e;
	}
	if (next.googleLoginEnabled && !(next.googleClientId && next.googleClientSecret)) {
		const e = new Error('Add a Google client ID and secret before enabling Google sign-in.');
		e.status = 400;
		throw e;
	}

	const updated = await prisma.organization.update({ where: { id: org.id }, data });
	await activityService.record(ACTIVITY_ACTION.ORG_SETTINGS_UPDATE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'organization', label: updated.name || 'Organization' },
		metadata: { changed: Object.keys(data) }
	});
	return getOrganization();
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
	getOrganization,
	getPublicBranding,
	getGoogleOAuthConfig,
	updateOrganization,
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
	updateBuiltInRunnerEnabled,
	getAiConfig,
	updateAiConfig,
	getGithubConfig,
	updateGithubConfig,
	getProjectAiConfig,
	updateProjectAiConfig,
	getProjectGithubConfig,
	updateProjectGithubConfig
};
