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

export async function fetchReports() {
	const res = await fetch(`${BASE}/reports`);
	const { reports } = await res.json();
	return reports.map(parseReport).filter(Boolean);
}

export async function fetchLatestReport() {
	const res = await fetch(`${BASE}/reports/latest`);
	const { latestReport } = await res.json();
	return latestReport;
}

export function reportUrl(fileName) {
	return `/reports/${encodeURIComponent(fileName)}`;
}

export async function fetchReportDetail(fileName) {
	const res = await fetch(`${BASE}/reports/${encodeURIComponent(fileName)}/detail`);
	if (!res.ok) throw new Error('Report not found');
	return res.json();
}

export function parseReport(fileName) {
	const match = fileName.match(
		/(PASS|FAIL)_cucumber_report_(.+?)_\(([^)]+)\)(?:_runners_(\d+))?_(\d{4})_(\d{2})_(\d{2})T(\d{2})_(\d{2})_(\d{2})_\d{3}Z\.json/
	);
	if (!match) return null;
	const [, status, triggerType, tags, runners = '1', year, month, day, hour, minute, second] =
		match;
	const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toLocaleString();
	return { fileName, status, triggerType, tags, runners: Number(runners), date };
}
