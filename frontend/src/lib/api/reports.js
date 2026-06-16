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

export async function fetchReports() {
	const res = await fetch(`${API_BASE}/reports`);
	const { reports } = await res.json();
	return reports.map((r) => ({ ...r, date: new Date(r.createdAt).toLocaleString() }));
}

export async function fetchLatestReportId() {
	const res = await fetch(`${API_BASE}/reports/latest`);
	const { latestReportId } = await res.json();
	return latestReportId;
}

export function reportUrl(id) {
	return `/reports/${id}`;
}

export function screenshotUrl(filename) {
	return `${API_BASE}/screenshots/${filename}`;
}

export async function fetchReportDetail(id) {
	const res = await fetch(`${API_BASE}/reports/${id}`);
	if (!res.ok) throw new Error('Report not found');
	return res.json();
}

export async function deleteReport(id) {
	const res = await fetch(`${API_BASE}/reports/${id}`, { method: 'DELETE' });
	if (!res.ok) throw new Error('Failed to delete report');
	return res.json();
}

export async function deleteReports(ids) {
	const res = await fetch(`${API_BASE}/reports/bulk`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});
	if (!res.ok) throw new Error('Failed to delete reports');
	return res.json();
}
