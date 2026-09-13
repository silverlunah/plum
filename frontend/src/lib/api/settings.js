/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE } from '$lib/constants';

function authHeaders() {
	return apiHeaders();
}

export async function fetchProject() {
	const res = await fetch(`${API_BASE}/settings/project`, { headers: authHeaders() });
	if (!res.ok)
		return {
			name: '',
			logoUrl: '',
			timezone: 'UTC',
			maxRetries: 0,
			defaultHome: 'automated',
			manualRepositoryOnly: false,
			testsPath: 'tests'
		};
	return res.json();
}

export async function saveProject({
	name,
	logoUrl,
	timezone,
	maxRetries,
	defaultHome,
	manualRepositoryOnly,
	testsPath
}) {
	const res = await fetch(`${API_BASE}/settings/project`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({
			name,
			logoUrl,
			timezone,
			maxRetries,
			defaultHome,
			manualRepositoryOnly,
			testsPath
		})
	});
	return res.json();
}

export async function fetchOrganization() {
	const res = await fetch(`${API_BASE}/settings/organization`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to load organization settings');
	return res.json();
}

// `patch` is a subset of the org fields; the backend applies only what's present.
export async function saveOrganization(patch) {
	const res = await fetch(`${API_BASE}/settings/organization`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(patch)
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to save organization settings');
	return data;
}

export async function exportBackup() {
	const res = await fetch(`${API_BASE}/backup/export`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Export failed');
	return res.json();
}

export async function importBackup(data) {
	const res = await fetch(`${API_BASE}/backup/import`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function fetchBackupConfig() {
	const res = await fetch(`${API_BASE}/backup/config`, { headers: authHeaders() });
	if (!res.ok)
		return {
			backupEnabled: false,
			backupCron: '0 2 * * *',
			timezone: 'UTC',
			backupS3Endpoint: '',
			backupS3Region: '',
			backupS3Bucket: '',
			backupS3AccessKey: '',
			backupS3SecretKeySet: false,
			backupS3Prefix: '',
			backupLastRunAt: null,
			backupLastStatus: ''
		};
	return res.json();
}

export async function saveBackupConfig(config) {
	const res = await fetch(`${API_BASE}/backup/config`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(config)
	});
	return res.json();
}

export async function testBackupS3(config) {
	const res = await fetch(`${API_BASE}/backup/test-s3`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify(config)
	});
	return res.json();
}

export async function runBackupNow() {
	const res = await fetch(`${API_BASE}/backup/run-now`, { method: 'POST', headers: authHeaders() });
	return res.json();
}

export async function fetchReportRetention() {
	const res = await fetch(`${API_BASE}/backup/report-retention`, { headers: authHeaders() });
	if (!res.ok) return { reportRetentionDays: 0 };
	return res.json();
}

export async function saveReportRetention(days) {
	const res = await fetch(`${API_BASE}/backup/report-retention`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ days })
	});
	if (!res.ok) throw new Error('Failed to save retention');
	return res.json();
}

export async function fetchS3Backups() {
	const res = await fetch(`${API_BASE}/backup/s3-backups`, { headers: authHeaders() });
	return res.json();
}

export async function restoreFromS3(key) {
	const res = await fetch(`${API_BASE}/backup/s3-restore`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ key })
	});
	return res.json();
}

export async function fetchIntegrations() {
	const res = await fetch(`${API_BASE}/settings/integrations`, { headers: authHeaders() });
	if (!res.ok) return { discordWebhookUrl: '', slackWebhookUrl: '' };
	return res.json();
}

export async function saveIntegrations({ discordWebhookUrl, slackWebhookUrl }) {
	const res = await fetch(`${API_BASE}/settings/integrations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ discordWebhookUrl, slackWebhookUrl })
	});
	return res.json();
}

export async function fetchAiConfig() {
	const res = await fetch(`${API_BASE}/settings/ai`, { headers: authHeaders() });
	if (!res.ok)
		return {
			anthropicApiKeySet: false,
			anthropicModel: '',
			openaiApiKeySet: false,
			openaiModel: ''
		};
	return res.json();
}

export async function saveAiConfig({ anthropicApiKey, anthropicModel, openaiApiKey, openaiModel }) {
	const res = await fetch(`${API_BASE}/settings/ai`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ anthropicApiKey, anthropicModel, openaiApiKey, openaiModel })
	});
	if (!res.ok) throw new Error('Failed to save AI provider settings');
	return res.json();
}

export async function fetchGithubConfig() {
	const res = await fetch(`${API_BASE}/settings/github`, { headers: authHeaders() });
	if (!res.ok) return { githubTokenSet: false };
	return res.json();
}

export async function saveGithubConfig({ githubToken }) {
	const res = await fetch(`${API_BASE}/settings/github`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ githubToken })
	});
	if (!res.ok) throw new Error('Failed to save GitHub connection');
	return res.json();
}

export async function verifyGithubConnection() {
	const res = await fetch(`${API_BASE}/settings/github/verify`, { headers: authHeaders() });
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Could not verify the GitHub connection');
	return data;
}

export async function fetchProjectAiConfig() {
	const res = await fetch(`${API_BASE}/settings/project/ai`, { headers: authHeaders() });
	if (!res.ok) return { aiSystemPrompt: '', aiCodePractices: '' };
	return res.json();
}

export async function saveProjectAiConfig({ aiSystemPrompt, aiCodePractices }) {
	const res = await fetch(`${API_BASE}/settings/project/ai`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ aiSystemPrompt, aiCodePractices })
	});
	if (!res.ok) throw new Error('Failed to save AI behaviour');
	return res.json();
}

export async function fetchProjectGithubConfig() {
	const res = await fetch(`${API_BASE}/settings/project/github`, { headers: authHeaders() });
	if (!res.ok) return { githubOwner: '', githubRepo: '', githubDefaultBranch: 'main' };
	return res.json();
}

export async function saveProjectGithubConfig({ githubOwner, githubRepo, githubDefaultBranch }) {
	const res = await fetch(`${API_BASE}/settings/project/github`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ githubOwner, githubRepo, githubDefaultBranch })
	});
	if (!res.ok) throw new Error('Failed to save repository settings');
	return res.json();
}

export async function fetchMcpConfig() {
	const res = await fetch(`${API_BASE}/settings/mcp`, { headers: authHeaders() });
	if (!res.ok) return { mcpKeySet: false, mcpKey: '' };
	return res.json();
}

export async function generateMcpKey() {
	const res = await fetch(`${API_BASE}/settings/mcp/generate`, {
		method: 'POST',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to generate key');
	return res.json();
}

export async function revokeMcpKey() {
	const res = await fetch(`${API_BASE}/settings/mcp`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to revoke key');
	return res.json();
}
