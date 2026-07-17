/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { API_BASE, REPORTS_PER_PAGE } from '$lib/constants';

function withDate(r) {
	return { ...r, date: new Date(r.createdAt).toLocaleString() };
}

export async function fetchReports({ page = 1, limit = REPORTS_PER_PAGE } = {}) {
	const params = new URLSearchParams({ page, limit });
	const res = await fetch(`${API_BASE}/reports?${params}`);
	const { reports, total, passCount, failCount, trend } = await res.json();
	return {
		reports: reports.map(withDate),
		total,
		passCount,
		failCount,
		trend: trend.map(withDate)
	};
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
