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

const BASE = 'http://localhost:3001';

export async function fetchProject() {
	const res = await fetch(`${BASE}/settings/project`);
	if (!res.ok) return { name: '', logoUrl: '' };
	return res.json();
}

export async function saveProject({ name, logoUrl }) {
	const res = await fetch(`${BASE}/settings/project`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, logoUrl })
	});
	return res.json();
}

export async function exportBackup() {
	const res = await fetch(`${BASE}/backup/export`);
	if (!res.ok) throw new Error('Export failed');
	return res.json();
}

export async function importBackup(data) {
	const res = await fetch(`${BASE}/backup/import`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}
