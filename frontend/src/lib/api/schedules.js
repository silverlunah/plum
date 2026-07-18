/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE } from '$lib/constants';

export async function fetchCronJobs() {
	const res = await fetch(`${API_BASE}/cron-jobs`);
	const { cronJobs } = await res.json();
	return cronJobs ?? [];
}

export async function saveCronJob({
	taskName,
	cronExpression,
	tags,
	workers,
	browser,
	runnerIds,
	notifyDiscord,
	notifySlack,
	isEditing,
	editTaskName
}) {
	const formattedTags = tags.replace(/\sOR\s/gi, (m) => m.toLowerCase());
	const url = isEditing
		? `${API_BASE}/cron-jobs/${encodeURIComponent(editTaskName)}`
		: `${API_BASE}/cron-jobs`;
	const method = isEditing ? 'PUT' : 'POST';
	const res = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			cronExpression,
			taskName,
			tags: formattedTags,
			workers,
			browser,
			runnerIds,
			notifyDiscord: notifyDiscord ?? false,
			notifySlack: notifySlack ?? false
		})
	});
	return res.json();
}

export async function toggleCronJob(taskName, enabled) {
	const res = await fetch(`${API_BASE}/cron-jobs/${encodeURIComponent(taskName)}/toggle`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ enabled })
	});
	return res.json();
}

export async function runCronJobNow(taskName) {
	const res = await fetch(`${API_BASE}/cron-jobs/${encodeURIComponent(taskName)}/run`, {
		method: 'POST'
	});
	return res.json();
}

export async function deleteCronJob(taskName) {
	const res = await fetch(`${API_BASE}/cron-jobs/${encodeURIComponent(taskName)}`, {
		method: 'DELETE'
	});
	return res.json();
}
