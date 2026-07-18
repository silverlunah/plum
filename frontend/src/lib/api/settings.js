/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function authHeaders() {
	return { Authorization: `Bearer ${auth.getToken()}` };
}

export async function fetchProject() {
	const res = await fetch(`${API_BASE}/settings/project`, { headers: authHeaders() });
	if (!res.ok) return { name: '', logoUrl: '', timezone: 'UTC', maxRetries: 0 };
	return res.json();
}

export async function saveProject({ name, logoUrl, timezone, maxRetries }) {
	const res = await fetch(`${API_BASE}/settings/project`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ name, logoUrl, timezone, maxRetries })
	});
	return res.json();
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

export async function fetchIntegrations() {
	const res = await fetch(`${API_BASE}/settings/integrations`, { headers: authHeaders() });
	if (!res.ok) return { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	return res.json();
}

export async function saveIntegrations({ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl }) {
	const res = await fetch(`${API_BASE}/settings/integrations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...authHeaders() },
		body: JSON.stringify({ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl })
	});
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
