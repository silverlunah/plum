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

/*
This file is part of Plum.

Plum is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Plum is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Plum. If not, see https://www.gnu.org/licenses/.
*/

const BASE = 'http://localhost:3001';

export async function fetchSchedules() {
	const res = await fetch(`${BASE}/schedules`);
	const { schedules } = await res.json();
	return schedules ?? [];
}

export async function fetchCronJobs() {
	const res = await fetch(`${BASE}/cron-jobs`);
	const { cronJobs } = await res.json();
	return cronJobs ?? [];
}

export async function saveCronJob({
	taskName,
	cronExpression,
	tags,
	workers,
	isEditing,
	editTaskName
}) {
	const formattedTags = tags.replace(/\sOR\s/gi, (m) => m.toLowerCase());
	const url = isEditing ? `${BASE}/cron-jobs/${editTaskName}` : `${BASE}/cron-jobs`;
	const method = isEditing ? 'PUT' : 'POST';
	const res = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ cronExpression, taskName, tags: formattedTags, workers })
	});
	return res.json();
}

export async function deleteCronJob(taskName) {
	const res = await fetch(`${BASE}/cron-jobs/${taskName}`, { method: 'DELETE' });
	return res.json();
}
