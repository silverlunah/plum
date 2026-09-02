/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');
const activityService = require('./activityService');
const { loadTestEnv } = require('../lib/testEnv');
const { resolveTestsRoot, loadProjectEnv } = require('../lib/testsRoot');
const { frameworkFor } = require('../lib/projectPaths');
const { BUILT_IN_RUNNER_ID } = require('../constants/triggers');
const { DEFAULT_BROWSER } = require('../constants/defaults');
const { ACTIVITY_ACTION, ACTIVITY_SCOPE } = require('../constants/activity');
const { bearerHeader } = require('../lib/authHeader');
const { JOB_STATUS, CANCEL_CODE } = require('../constants/jobStatus');

// Liveness, not a run-duration cap: a healthy run keeps answering the 1s poll,
// so only a node that has gone silent this long has its lane marked failed.
const NODE_UNREACHABLE_GRACE_MS = 45_000;

// ---------------------------------------------------------------------------
// Runner CRUD
// ---------------------------------------------------------------------------

// Strips the auth token before a runner row crosses the HTTP boundary, the
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

// Upsert on name+url. Re-registering the same node (`plum node start` run
// again, a stop/recreate) must refresh its token in place, a second row or a
// kept-stale token leaves the primary pinging with the wrong credential and the
// node showing "unreachable".
const create = async ({ name, url, token, browser = DEFAULT_BROWSER }) => {
	const normalisedUrl = normaliseUrl(url);
	const existing = await prisma.runner.findFirst({ where: { name, url: normalisedUrl } });
	const runner = existing
		? await prisma.runner.update({ where: { id: existing.id }, data: { token, browser } })
		: await prisma.runner.create({ data: { name, url: normalisedUrl, token, browser } });
	await activityService.record(
		existing ? ACTIVITY_ACTION.NODE_UPDATE : ACTIVITY_ACTION.NODE_CREATE,
		{
			scope: ACTIVITY_SCOPE.ORG,
			target: { type: 'node', id: runner.id, label: runner.name }
		}
	);
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
	const runner = await prisma.runner.findUnique({ where: { id }, select: { name: true } });
	const result = await prisma.runner.delete({ where: { id } });
	await activityService.record(ACTIVITY_ACTION.NODE_DELETE, {
		scope: ACTIVITY_SCOPE.ORG,
		target: { type: 'node', id, label: runner?.name ?? id }
	});
	return result;
}

// Raw accessor (includes token): internal use only, for authenticating
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
			headers: bearerHeader(token),
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
			headers: bearerHeader(runner.token),
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

// After PLUM_NODE_SECRET is regenerated, hand the new value to every node so its
// saved config stays valid for the next `plum node` command. Best-effort, an
// offline node keeps running fine, it just needs a manual update later.
async function pushNodeSecret(secret) {
	const runners = await prisma.runner.findMany();
	const results = await Promise.all(
		runners.map(async (r) => {
			try {
				const res = await fetch(`${r.url}/api/node-secret`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', ...bearerHeader(r.token) },
					body: JSON.stringify({ secret }),
					signal: AbortSignal.timeout(8000)
				});
				return { name: r.name, ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
			} catch (e) {
				return { name: r.name, ok: false, error: e.message };
			}
		})
	);
	return {
		applied: results.filter((x) => x.ok).map((x) => x.name),
		failed: results.filter((x) => !x.ok).map(({ name, error }) => ({ name, error }))
	};
}

// ---------------------------------------------------------------------------
// Remote execution
// ---------------------------------------------------------------------------

// Folders that must never go over the wire. node_modules is the important one: a
// project that declares its own dependencies has one, and uploading it would send
// hundreds of megabytes per lane per run. A node resolves the toolchain from its
// own backend instead (see NODE_PATH in nodeExecutionService).
const UPLOAD_SKIP_DIRS = new Set(['node_modules', 'test-results', 'playwright-report', '.git']);

function collectTestFiles(testsDir) {
	const files = {};

	function walk(dir, rel) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const fullPath = path.join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (UPLOAD_SKIP_DIRS.has(entry.name)) continue;
				walk(fullPath, relPath);
			} else {
				// base64, not utf8: utf8 mangles non-text fixtures (e.g. upload test images)
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
			headers: bearerHeader(runner.token),
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
	{ projectId, tags, browser, workers, shard = null, baseUrl },
	onLog,
	onDone,
	onRRwebBatch = null,
	onJobId = null,
	shouldStop = () => false
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
				...bearerHeader(runner.token)
			},
			body: JSON.stringify({
				tags,
				browser,
				workers,
				framework: frameworkFor(projectId),
				shard,
				tests: collectTestFiles(resolveTestsRoot(projectId)),
				env: {
					...loadTestEnv(process.cwd()),
					...loadProjectEnv(projectId),
					IS_HEADLESS: 'true', // node runs on a server have no display, never headed
					...(baseUrl ? { BASE_URL: baseUrl } : {})
				}
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

	onJobId?.(jobId);
	onLog(`Connected to runner "${runner.name}": job ${jobId}\n`);

	let logOffset = 0;
	let rrwebOffset = 0;
	let polling = false;
	let unreachableSince = null;
	// Tight interval: the live viewer reads logs and rrweb batches straight off
	// this poll: primary→node, so nothing has to connect the other way.
	const poll = setInterval(async () => {
		if (polling) return;
		polling = true;
		try {
			// Stop the moment the user cancels: don't wait on an unreachable node
			// to acknowledge it.
			if (shouldStop()) {
				clearInterval(poll);
				cancelRemoteJob(runnerId, jobId).catch(() => {});
				finish(CANCEL_CODE, null);
				return;
			}

			const res = await fetch(
				`${runner.url}/api/execute/${jobId}?offset=${logOffset}&rrwebOffset=${rrwebOffset}`,
				{
					headers: bearerHeader(runner.token),
					signal: AbortSignal.timeout(8000)
				}
			);
			// Must advance the watchdog, not return: a restarted node 404s the job it
			// forgot (and a rotated token 401s) for good, and lanes are awaited together,
			// so a lane that never settles hangs the whole run.
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = await res.json();
			unreachableSince = null;

			if (body.logs) {
				onLog(body.logs);
				logOffset += body.logs.length;
			}
			for (const batch of body.rrwebBatches ?? []) onRRwebBatch?.(batch);
			rrwebOffset += body.rrwebBatches?.length ?? 0;

			if (body.status === JOB_STATUS.DONE || body.status === JOB_STATUS.ERROR) {
				clearInterval(poll);
				const content = await fetchReportContent(runner, jobId, onLog);
				finish(body.exitCode ?? (body.status === JOB_STATUS.DONE ? 0 : 1), content);
			}
		} catch (e) {
			if (unreachableSince === null) {
				unreachableSince = Date.now();
			} else if (Date.now() - unreachableSince > NODE_UNREACHABLE_GRACE_MS) {
				clearInterval(poll);
				onLog(
					`\n[ERROR] Runner "${runner.name}" stopped responding (${e.message}), ` +
						`marking this lane failed.\n`
				);
				finish(1, null);
			}
		} finally {
			polling = false;
		}
	}, 1000);
}

// Best-effort remote cancel: tells the node to SIGTERM the job's test process.
// The polling loop in dispatchAndPoll still finalises the lane when the node
// reports the job done/errored, so a failed cancel here is not fatal.
async function cancelRemoteJob(runnerId, jobId) {
	const runner = await getById(runnerId);
	if (!runner) return;
	try {
		await fetch(`${runner.url}/api/cancel/${jobId}`, {
			method: 'POST',
			headers: bearerHeader(runner.token),
			signal: AbortSignal.timeout(8000)
		});
	} catch {}
}

module.exports = {
	getAll,
	create,
	remove,
	getById,
	probe,
	ping,
	stop,
	restart,
	pushNodeSecret,
	dispatchAndPoll,
	cancelRemoteJob
};
