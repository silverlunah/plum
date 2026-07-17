/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const { loadTestEnv } = require('../lib/testEnv');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');

// ---------------------------------------------------------------------------
// Runner CRUD
// ---------------------------------------------------------------------------

// Strips the auth token before a runner row crosses the HTTP boundary — the
// token is only ever needed internally (ping/stop/restart/dispatch below all
// read it via getById, whose result never reaches a client directly).
function toPublicRunner(runner) {
	if (!runner) return runner;
	const { token, ...safe } = runner;
	return { ...safe, tokenSet: Boolean(token) };
}

const getAll = async () => {
	const runners = await prisma.runner.findMany({ orderBy: { createdAt: 'asc' } });
	return runners.map(toPublicRunner);
};

const normaliseUrl = (url) => (url ?? '').replace(/\/+$/, '');

const create = async ({ name, url, token, browser = 'chromium' }) => {
	const runner = await prisma.runner.create({
		data: { name, url: normaliseUrl(url), token, browser }
	});
	return toPublicRunner(runner);
};

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
			data: { runnerIds: ids.length > 0 ? ids.join(',') : BUILT_IN_RUNNER_ID }
		});
	}
	return prisma.runner.delete({ where: { id } });
}

// Leaving `token` blank keeps the existing one (same pattern as the S3 backup
// secret key) instead of clearing a runner's auth on an unrelated edit.
const update = async (id, { name, url, token, browser }) => {
	const runner = await prisma.runner.update({
		where: { id },
		data: {
			...(name !== undefined && { name }),
			...(url !== undefined && { url: normaliseUrl(url) }),
			...(token && { token }),
			...(browser !== undefined && { browser })
		}
	});
	return toPublicRunner(runner);
};

// Raw accessor (includes token) — internal use only, for authenticating
// outbound requests to the runner node (ping/stop/restart/dispatch below).
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
// Remote control
// ---------------------------------------------------------------------------

async function callControlEndpoint(id, endpoint, timeoutMs) {
	const runner = await getById(id);
	if (!runner) return { ok: false, error: 'Runner not found' };
	try {
		const res = await fetch(`${runner.url}/api/${endpoint}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${runner.token}` },
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

const stop = (id) => callControlEndpoint(id, 'shutdown', 5000);
const restart = (id) => callControlEndpoint(id, 'restart', 5000);

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
				// base64, not utf8 — utf8 mangles non-text fixtures (e.g. upload test images)
				// because arbitrary binary bytes aren't valid UTF-8 and get replaced on read.
				files[relPath] = fs.readFileSync(fullPath).toString('base64');
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
			body: JSON.stringify({
				tags,
				browser,
				workers,
				tests: collectTestFiles(),
				env: loadTestEnv(process.cwd())
			}),
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
	stop,
	restart,
	dispatchAndPoll
};
