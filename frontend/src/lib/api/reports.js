/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { apiHeaders } from '$lib/api/headers';
import { API_BASE, REPORTS_PER_PAGE } from '$lib/constants';
import { downloadFromEndpoint } from '$lib/utils/download';

function withDate(r) {
	return { ...r, date: new Date(r.createdAt).toLocaleString() };
}

export async function fetchReports({ page = 1, limit = REPORTS_PER_PAGE } = {}) {
	const params = new URLSearchParams({ page, limit });
	const res = await fetch(`${API_BASE}/reports?${params}`, { headers: apiHeaders() });
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
	const res = await fetch(`${API_BASE}/reports/latest`, { headers: apiHeaders() });
	const { latestReportId } = await res.json();
	return latestReportId;
}

export function reportUrl(id) {
	return `/reports/${id}`;
}

export async function fetchReportDetail(id) {
	const res = await fetch(`${API_BASE}/reports/${id}`, { headers: apiHeaders() });
	if (!res.ok) throw new Error('Report not found');
	return res.json();
}

export async function fetchRecordings(reportId) {
	const res = await fetch(`${API_BASE}/reports/${reportId}/recordings`, { headers: apiHeaders() });
	if (!res.ok) throw new Error('Failed to fetch recordings');
	return res.json();
}

export async function fetchRecordingEvents(reportId, recordingId) {
	const res = await fetch(`${API_BASE}/reports/${reportId}/recordings/${recordingId}/events`, {
		headers: apiHeaders()
	});
	if (!res.ok) throw new Error('Failed to fetch recording events');
	const { events } = await res.json();
	return events;
}

export async function downloadReportExport(id, format) {
	await downloadFromEndpoint(`${API_BASE}/reports/${id}/export?format=${format}`, {
		headers: apiHeaders(),
		fallbackName: `report-${id}.${format}`
	});
}

export async function deleteReport(id) {
	const res = await fetch(`${API_BASE}/reports/${id}`, { method: 'DELETE', headers: apiHeaders() });
	if (!res.ok) throw new Error('Failed to delete report');
	return res.json();
}

export async function deleteReports(ids) {
	const res = await fetch(`${API_BASE}/reports/bulk`, {
		method: 'DELETE',
		headers: apiHeaders({ json: true }),
		body: JSON.stringify({ ids })
	});
	if (!res.ok) throw new Error('Failed to delete reports');
	return res.json();
}
