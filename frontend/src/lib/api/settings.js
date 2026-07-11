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

import { API_BASE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function authHeaders() {
	return { Authorization: `Bearer ${auth.getToken()}` };
}

export async function fetchProject() {
	const res = await fetch(`${API_BASE}/settings/project`);
	if (!res.ok) return { name: '', logoUrl: '', timezone: 'UTC' };
	return res.json();
}

export async function saveProject({ name, logoUrl, timezone }) {
	const res = await fetch(`${API_BASE}/settings/project`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, logoUrl, timezone })
	});
	return res.json();
}

export async function exportBackup() {
	const res = await fetch(`${API_BASE}/backup/export`);
	if (!res.ok) throw new Error('Export failed');
	return res.json();
}

export async function importBackup(data) {
	const res = await fetch(`${API_BASE}/backup/import`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function fetchBackupConfig() {
	const res = await fetch(`${API_BASE}/backup/config`);
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
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(config)
	});
	return res.json();
}

export async function testBackupS3(config) {
	const res = await fetch(`${API_BASE}/backup/test-s3`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(config)
	});
	return res.json();
}

export async function runBackupNow() {
	const res = await fetch(`${API_BASE}/backup/run-now`, { method: 'POST' });
	return res.json();
}

export async function fetchIntegrations() {
	const res = await fetch(`${API_BASE}/settings/integrations`);
	if (!res.ok) return { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	return res.json();
}

export async function saveIntegrations({ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl }) {
	const res = await fetch(`${API_BASE}/settings/integrations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
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
