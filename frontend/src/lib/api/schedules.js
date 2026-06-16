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
			runnerIds
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
