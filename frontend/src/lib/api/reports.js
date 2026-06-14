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

export async function fetchReports() {
	const res = await fetch(`${BASE}/reports`);
	const { reports } = await res.json();
	return reports.map((r) => ({ ...r, date: new Date(r.createdAt).toLocaleString() }));
}

export async function fetchLatestReport() {
	const res = await fetch(`${BASE}/reports/latest`);
	const { latestReport } = await res.json();
	return latestReport;
}

export function reportUrl(fileName) {
	return `/reports/${encodeURIComponent(fileName)}`;
}

// Parses metadata out of a report filename.
// Format: {STATUS}_cucumber_report_{trigger}_{tags}_runners_{n}_{timestamp}.json
export function parseReport(fileName) {
	const m = fileName.match(
		/^(PASS|FAIL)_cucumber_report_(.+?)_(\([^)]+\))_runners_(\d+)_(\d{4}_\d{2}_\d{2}T[\d_]+Z)\.json$/
	);
	if (!m) return null;
	const [, status, triggerType, tags, runners, tsRaw] = m;
	const isoStr = tsRaw.replace(
		/^(\d{4})_(\d{2})_(\d{2})T(\d{2})_(\d{2})_(\d{2})_(\d+)Z$/,
		'$1-$2-$3T$4:$5:$6.$7Z'
	);
	return {
		status,
		triggerType,
		tags,
		runners: parseInt(runners, 10),
		date: new Date(isoStr).toLocaleString()
	};
}

export async function fetchReportDetail(fileName) {
	const res = await fetch(`${BASE}/reports/${encodeURIComponent(fileName)}/detail`);
	if (!res.ok) throw new Error('Report not found');
	return res.json();
}

export async function deleteReport(fileName) {
	const res = await fetch(`${BASE}/reports/${encodeURIComponent(fileName)}`, {
		method: 'DELETE'
	});
	if (!res.ok) throw new Error('Failed to delete report');
	return res.json();
}

export async function deleteReports(fileNames) {
	const res = await fetch(`${BASE}/reports/bulk`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ fileNames })
	});
	if (!res.ok) throw new Error('Failed to delete reports');
	return res.json();
}
