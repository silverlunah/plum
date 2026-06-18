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

import { API_BASE, REPO_PAGE_SIZE } from '$lib/constants';
import { auth } from '$lib/stores/auth';

function getToken() {
	return auth.getToken();
}

function authHeaders() {
	return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// ── Test Suites ──────────────────────────────────────────────────────────────

export async function fetchSuites({ page = 1, limit = REPO_PAGE_SIZE, sortBy, sortOrder } = {}) {
	const params = new URLSearchParams({ page, limit });
	if (sortBy) params.set('sortBy', sortBy);
	if (sortOrder) params.set('sortOrder', sortOrder);
	const res = await fetch(`${API_BASE}/test-suites?${params}`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch suites');
	return res.json(); // { suites, total }
}

export async function fetchAllSuitesWithCases() {
	const res = await fetch(`${API_BASE}/test-suites?withCases=true`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch suites');
	const data = await res.json();
	return data.suites;
}

export async function searchRepository(q) {
	const enc = encodeURIComponent(q);
	const [sRes, rRes] = await Promise.all([
		fetch(`${API_BASE}/test-suites?q=${enc}`, { headers: authHeaders() }),
		fetch(`${API_BASE}/test-runs?q=${enc}&limit=50`, { headers: authHeaders() })
	]);
	const { suites, cases } = await sRes.json();
	const { runs } = await rRes.json();
	return { suites, cases, runs };
}

export async function fetchSuite(id) {
	const res = await fetch(`${API_BASE}/test-suites/${id}`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Suite not found');
	const data = await res.json();
	return data.suite;
}

export async function createSuite({ name, description, priority }) {
	const res = await fetch(`${API_BASE}/test-suites`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ name, description, priority })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to create suite');
	return data.suite;
}

export async function updateSuite(id, { name, description, priority }) {
	const res = await fetch(`${API_BASE}/test-suites/${id}`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ name, description, priority })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to update suite');
	return data.suite;
}

export async function deleteSuite(id) {
	const res = await fetch(`${API_BASE}/test-suites/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to delete suite');
}

// ── Test Cases ───────────────────────────────────────────────────────────────

export async function fetchTestCase(id) {
	const res = await fetch(`${API_BASE}/test-cases/${id}`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Test case not found');
	const data = await res.json();
	return data.testCase;
}

export async function createTestCase({ suiteId, title, description, priority }) {
	const res = await fetch(`${API_BASE}/test-cases`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ suiteId, title, description, priority })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to create test case');
	return data.testCase;
}

export async function updateTestCase(id, { title, description, priority }) {
	const res = await fetch(`${API_BASE}/test-cases/${id}`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ title, description, priority })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to update test case');
	return data.testCase;
}

export async function saveSteps(caseId, steps) {
	const res = await fetch(`${API_BASE}/test-cases/${caseId}/steps`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ steps })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to save steps');
	return data.steps;
}

export async function deleteTestCase(id) {
	const res = await fetch(`${API_BASE}/test-cases/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to delete test case');
}

// ── Test Runs ────────────────────────────────────────────────────────────────

export async function fetchRuns({ page = 1, limit = REPO_PAGE_SIZE, sortBy, sortOrder } = {}) {
	const params = new URLSearchParams({ page, limit });
	if (sortBy) params.set('sortBy', sortBy);
	if (sortOrder) params.set('sortOrder', sortOrder);
	const res = await fetch(`${API_BASE}/test-runs?${params}`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch test runs');
	return res.json(); // { runs, total }
}

export async function fetchRun(id) {
	const res = await fetch(`${API_BASE}/test-runs/${id}`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Test run not found');
	const data = await res.json();
	return data.run;
}

export async function createRun({ title, caseIds }) {
	const res = await fetch(`${API_BASE}/test-runs`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ title, caseIds })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to create test run');
	return data.run;
}

export async function updateRun(id, { title, status, caseIds }) {
	const res = await fetch(`${API_BASE}/test-runs/${id}`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ title, status, caseIds })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to update test run');
	return data.run;
}

export async function duplicateRun(id) {
	const res = await fetch(`${API_BASE}/test-runs/${id}/duplicate`, {
		method: 'POST',
		headers: authHeaders()
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to duplicate run');
	return data.run;
}

export async function deleteRun(id) {
	const res = await fetch(`${API_BASE}/test-runs/${id}`, {
		method: 'DELETE',
		headers: authHeaders()
	});
	if (!res.ok) throw new Error('Failed to delete test run');
}

export async function recordEntryResult(entryId, { status, notes }) {
	const res = await fetch(`${API_BASE}/test-runs/entries/${entryId}/result`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ status, notes })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to record result');
	return data.entry;
}

export async function assignEntry(entryId, userId) {
	const res = await fetch(`${API_BASE}/test-runs/entries/${entryId}/assign`, {
		method: 'PUT',
		headers: authHeaders(),
		body: JSON.stringify({ userId: userId ?? null })
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? 'Failed to assign entry');
	return data.entry;
}

export async function fetchMembers() {
	const res = await fetch(`${API_BASE}/users/members`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch members');
	const data = await res.json();
	return data.users;
}

// ── Prefixes ─────────────────────────────────────────────────────────────────

export async function fetchPrefixes() {
	const res = await fetch(`${API_BASE}/settings/test-prefixes`, { headers: authHeaders() });
	if (!res.ok) throw new Error('Failed to fetch prefixes');
	return res.json();
}

export async function savePrefixes({ testCasePrefix, testSuitePrefix }) {
	const res = await fetch(`${API_BASE}/settings/test-prefixes`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ testCasePrefix, testSuitePrefix })
	});
	return res.json();
}

export async function migratePrefixes({ testCasePrefix, testSuitePrefix }) {
	const res = await fetch(`${API_BASE}/settings/test-prefixes/migrate`, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify({ testCasePrefix, testSuitePrefix })
	});
	return res.json();
}
