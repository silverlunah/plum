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
const prisma = require('./prisma');

// ---------------------------------------------------------------------------
// Runner CRUD
// ---------------------------------------------------------------------------

const getAll = () => prisma.runner.findMany({ orderBy: { createdAt: 'asc' } });

const normaliseUrl = (url) => (url ?? '').replace(/\/+$/, '');

const create = ({ name, url, token, browser = 'chromium' }) =>
	prisma.runner.create({ data: { name, url: normaliseUrl(url), token, browser } });

async function remove(id) {
	// Scrub the deleted runner from any cron job's runnerIds string before
	// deleting, since that field has no relational constraint.
	const jobs = await prisma.cronJob.findMany({ select: { id: true, runnerIds: true } });
	for (const job of jobs) {
		const ids = job.runnerIds
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s && s !== id);
		await prisma.cronJob.update({
			where: { id: job.id },
			data: { runnerIds: ids.length > 0 ? ids.join(',') : 'built-in' }
		});
	}
	return prisma.runner.delete({ where: { id } });
}

const update = (id, data) =>
	prisma.runner.update({
		where: { id },
		data: { ...data, ...(data.url && { url: normaliseUrl(data.url) }) }
	});

const getById = (id) => prisma.runner.findUnique({ where: { id } });

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

async function probe({ url, token }) {
	const start = Date.now();
	try {
		const res = await fetch(`${url}/api/ping`, {
			method: 'GET',
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
		const body = await res.json();
		if (!body.ok || body.mode !== 'node') {
			return { ok: false, error: 'URL does not point to a Plum runner node' };
		}
		return { ok: true, latency: Date.now() - start };
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

async function ping(id) {
	const runner = await getById(id);
	if (!runner) return { ok: false, error: 'Runner not found' };
	return probe({ url: runner.url, token: runner.token });
}

// ---------------------------------------------------------------------------
// Remote execution
// ---------------------------------------------------------------------------

function collectTestFiles() {
	const testsDir = path.resolve(process.cwd(), 'tests');
	const files = {};

	function walk(dir, rel) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(fullPath, relPath);
			} else {
				files[relPath] = fs.readFileSync(fullPath, 'utf8');
			}
		}
	}

	if (fs.existsSync(testsDir)) walk(testsDir, '');
	return files;
}

/**
 * Fetches the raw cucumber JSON content from a finished remote node job.
 * Returns the content string, or null on failure.
 */
async function fetchReportContent(runner, jobId, onLog) {
	try {
		const res = await fetch(`${runner.url}/api/report/${jobId}`, {
			headers: { Authorization: `Bearer ${runner.token}` },
			signal: AbortSignal.timeout(15000)
		});
		if (!res.ok) {
			onLog(`[WARN] Could not fetch report from "${runner.name}": HTTP ${res.status}\n`);
			return null;
		}
		const { content } = await res.json();
		return content ?? null;
	} catch (e) {
		onLog(`[WARN] Could not fetch report from "${runner.name}": ${e.message}\n`);
		return null;
	}
}

/**
 * Dispatches a test job to a remote runner node and polls until it finishes.
 *
 * @param {string} runnerId
 * @param {{ tags: string, browser: string, workers: number }} jobParams
 * @param {(log: string) => void} onLog   Called with each new log chunk
 * @param {(exitCode: number, reportContent: string|null) => void} onDone
 */
async function dispatchAndPoll(
	runnerId,
	{ tags, browser, workers },
	onLog,
	onDone,
	onScreenshot = null
) {
	// The async poll callback can overlap if a tick takes longer than the interval;
	// guard so the run resolves exactly once and can't be finalised while a lane
	// is still in flight.
	let settled = false;
	const finish = (code, content) => {
		if (settled) return;
		settled = true;
		onDone(code, content);
	};

	const runner = await getById(runnerId);
	if (!runner) {
		onLog(`[ERROR] Runner ${runnerId} not found\n`);
		finish(1, null);
		return;
	}

	let jobId;
	try {
		const res = await fetch(`${runner.url}/api/execute`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${runner.token}`
			},
			body: JSON.stringify({ tags, browser, workers, tests: collectTestFiles() }),
			signal: AbortSignal.timeout(10000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		jobId = (await res.json()).jobId;
	} catch (e) {
		onLog(`[ERROR] Could not reach runner "${runner.name}": ${e.message}\n`);
		finish(1, null);
		return;
	}

	onLog(`Connected to runner "${runner.name}" — job ${jobId}\n`);

	let logOffset = 0;
	let polling = false;
	const poll = setInterval(async () => {
		if (polling) return;
		polling = true;
		try {
			const res = await fetch(`${runner.url}/api/execute/${jobId}?offset=${logOffset}`, {
				headers: { Authorization: `Bearer ${runner.token}` },
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) return;
			const body = await res.json();

			if (body.logs) {
				onLog(body.logs);
				logOffset += body.logs.length;
			}

			if (onScreenshot && Array.isArray(body.screenshots)) {
				for (const ss of body.screenshots) onScreenshot(ss);
			}

			if (body.status === 'done' || body.status === 'error') {
				clearInterval(poll);
				const content = await fetchReportContent(runner, jobId, onLog);
				finish(body.exitCode ?? (body.status === 'done' ? 0 : 1), content);
			}
		} catch {
			// transient polling error — keep trying
		} finally {
			polling = false;
		}
	}, 2500);
}

module.exports = {
	getAll,
	create,
	remove,
	update,
	getById,
	probe,
	ping,
	dispatchAndPoll
};
