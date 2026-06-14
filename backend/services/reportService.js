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

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');

const getAllReports = () => {
	const files = fs.readdirSync(REPORTS_DIR);
	const jsonFiles = files.filter(
		(f) => f.endsWith('.json') && (f.startsWith('PASS_') || f.startsWith('FAIL_'))
	);
	return jsonFiles.sort((a, b) => {
		const at = fs.statSync(path.join(REPORTS_DIR, a)).mtime;
		const bt = fs.statSync(path.join(REPORTS_DIR, b)).mtime;
		return bt - at;
	});
};

const getLatestReport = () => {
	const files = getAllReports();
	return files.length ? files[0] : null;
};

const getReportDetail = (fileName) => {
	const filePath = path.join(REPORTS_DIR, fileName);
	if (!filePath.startsWith(REPORTS_DIR)) return null; // path traversal guard
	if (!fs.existsSync(filePath)) return null;

	let raw;
	try {
		raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}

	const features = raw.map((feature) => {
		const scenarios = (feature.elements || []).map((scenario) => {
			const steps = scenario.steps
				.filter((s) => !s.hidden) // skip Before/After hooks
				.map((step) => ({
					keyword: step.keyword.trim(),
					name: step.name ?? '',
					status: step.result?.status ?? 'pending',
					duration: Math.round((step.result?.duration ?? 0) / 1_000_000), // ns → ms
					error: step.result?.error_message ?? null,
					screenshot: step.embeddings?.find((e) => e.mime_type === 'image/png')?.data ?? null,
				}));

			const worstStatus = steps.reduce((acc, s) => {
				const rank = { failed: 3, pending: 2, skipped: 1, passed: 0 };
				return (rank[s.status] ?? 0) > (rank[acc] ?? 0) ? s.status : acc;
			}, 'passed');

			return {
				name: scenario.name,
				keyword: scenario.keyword,
				tags: (scenario.tags ?? []).map((t) => t.name),
				status: worstStatus,
				duration: steps.reduce((s, st) => s + st.duration, 0),
				steps,
			};
		});

		const featureStatus = scenarios.some((s) => s.status === 'failed') ? 'failed' : 'passed';

		return {
			name: feature.name,
			uri: feature.uri,
			status: featureStatus,
			scenarios,
		};
	});

	return { features };
};

module.exports = { getAllReports, getLatestReport, getReportDetail };
