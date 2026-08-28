/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Interactive manager for local node runners.
 *
 * Registers new runners with the Plum primary and starts / stops / restarts the
 * node processes that back local runners, all from one menu.
 *
 * Usage:  node scripts/manage-runners.mjs
 *    or:  npm run manage-runners     (from the backend directory)
 *
 * Env:    PLUM_API_URL   primary server API base (default http://localhost:3001)
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import runnerProcess from '../lib/runnerProcess.js';
import nodeRegister from '../lib/nodeRegister.js';

const { isLocalUrl, parsePort, pruneDead, statusOf, findPidOnPort } = runnerProcess;
const { generateToken, detectLanIp, loadNodeByName } = nodeRegister;

const API_URL = process.env.PLUM_API_URL || 'http://localhost:3001';

// This menu is a thin front-end over the `plum node` commands for anything that
// touches a node on THIS machine (add / start / restart / stop / delete), so
// there is exactly one code path and it matches `plum node start` exactly.
const PLUM_BIN = path.resolve(fileURLToPath(import.meta.url), '../../../bin/plum.js');
function plumNode(...args) {
	execFileSync(process.execPath, [PLUM_BIN, 'node', ...args], { stdio: 'inherit' });
}

const cancelled = (v) => clack.isCancel(v);

// The mutating /runners routes accept any registered runner's own token in
// place of an admin session (runnerOrAdmin.js). Use one: handed in by `plum`
// (which reads it from the primary's DB on the server host), or any node's own
// stored token.
function resolveRunnerToken() {
	if (process.env.PLUM_RUNNER_TOKEN) return process.env.PLUM_RUNNER_TOKEN;
	for (const name of nodeRegister.listNodeNames()) {
		const token = loadNodeByName(name).token;
		if (token) return token;
	}
	return null;
}
const RUNNER_TOKEN = resolveRunnerToken();
function authHeaders() {
	return RUNNER_TOKEN ? { Authorization: `Bearer ${RUNNER_TOKEN}` } : {};
}

/**
 * When the primary runs in Docker it cannot reach `localhost` on the host —
 * only substitute when the user explicitly enters localhost/127.0.0.1.
 */
function resolveNodeUrl(url) {
	try {
		const u = new URL(url);
		if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
			u.hostname = 'host.docker.internal';
		}
		return u.toString().replace(/\/+$/, '');
	} catch {}
	return url.replace(/\/+$/, '');
}

async function fetchRunners() {
	const res = await fetch(`${API_URL}/runners`, { headers: authHeaders() });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const body = await res.json();
	return body.runners ?? [];
}

async function pingRunner(id) {
	try {
		const res = await fetch(`${API_URL}/runners/${id}/ping`, {
			method: 'POST',
			headers: authHeaders()
		});
		const body = await res.json().catch(() => ({}));
		return body.ok === true;
	} catch {
		return false;
	}
}

async function deleteRunner(id) {
	const res = await fetch(`${API_URL}/runners/${id}`, { method: 'DELETE', headers: authHeaders() });
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error || `HTTP ${res.status}`);
	}
}

/**
 * Stops/restarts a runner over the network via the primary's control routes,
 * which hit the runner's own /api/shutdown|restart endpoints — works for any
 * reachable runner, not just ones whose process this manager owns by PID.
 */
async function controlRunner(id, action) {
	const res = await fetch(`${API_URL}/runners/${id}/${action}`, {
		method: 'POST',
		headers: authHeaders()
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
}

/**
 * Resolves the display + control state for every runner: reachability (ping),
 * whether we own a live process for it, and whether we can control it at all.
 *
 * Local runners that are online but absent from the registry are automatically
 * reclaimed by scanning their port for a running process.
 */
async function describeRunners() {
	const runners = await fetchRunners();
	pruneDead();

	return Promise.all(
		runners.map(async (r) => {
			const online = await pingRunner(r.id);
			const local = isLocalUrl(r.url);
			let managed = statusOf(r.id) === 'running';

			if (local && online && !managed) {
				const port = Number(parsePort(r.url));
				const pid = findPidOnPort(port);
				if (pid) {
					const registry = runnerProcess.loadRegistry();
					registry[r.id] = { pid, port: String(port), startedAt: Date.now() };
					runnerProcess.saveRegistry(registry);
					managed = true;
				}
			}

			let state;
			if (managed) state = 'managed';
			else if (online) state = 'unmanaged';
			else state = 'stopped';
			return { ...r, online, local, managed, state };
		})
	);
}

function statusBadge(r) {
	const dot = r.online ? pc.green('●') : pc.dim('○');
	let detail;
	if (r.managed) detail = pc.green('running');
	else if (r.online) detail = pc.yellow(r.local ? 'running (unmanaged)' : 'running (remote)');
	else detail = pc.dim('stopped');
	return `${dot} ${detail}`;
}

async function runAction(r) {
	const localCfg = loadNodeByName(r.name);
	const isLocalNode = Boolean(localCfg.id) && localCfg.id === r.id;

	const options = [];
	if (isLocalNode) {
		options.push(
			{ value: 'restart', label: pc.yellow(r.online ? 'Restart' : 'Start') },
			{ value: 'stop', label: pc.red('Stop') },
			{ value: 'log', label: 'Show log path' },
			{ value: 'ping', label: 'Ping' }
		);
	} else if (r.online) {
		options.push(
			{ value: 'stop', label: pc.red('Stop') },
			{ value: 'restart', label: pc.yellow('Restart') },
			{ value: 'ping', label: 'Ping' }
		);
	} else {
		options.push({ value: 'ping', label: 'Ping' });
	}
	options.push(
		{ value: 'token', label: 'Show token' },
		{ value: 'delete', label: pc.red('Delete') },
		{ value: 'back', label: pc.dim('← Back') }
	);

	const action = await clack.select({ message: `${r.name} — ${r.url}`, options });
	if (cancelled(action) || action === 'back') return;

	if (action === 'restart') {
		if (isLocalNode) {
			try {
				plumNode('restart', r.name);
			} catch {}
		} else {
			const s = clack.spinner();
			s.start(`Restarting "${r.name}"...`);
			try {
				await controlRunner(r.id, 'restart');
				s.stop(pc.green(`Restarted "${r.name}"`));
			} catch (e) {
				s.stop(pc.red(`Could not restart "${r.name}": ${e.message}`));
			}
		}
	} else if (action === 'stop') {
		if (isLocalNode) {
			try {
				plumNode('stop', r.name);
			} catch {}
		} else {
			const s = clack.spinner();
			s.start(`Stopping "${r.name}"...`);
			try {
				await controlRunner(r.id, 'stop');
				s.stop(pc.green(`Stopped "${r.name}"`));
			} catch (e) {
				s.stop(pc.red(`Could not stop "${r.name}": ${e.message}`));
			}
		}
	} else if (action === 'delete') {
		const confirmed = await clack.confirm({
			message: `Delete "${r.name}" — its process, local config, and primary registration?`,
			initialValue: false
		});
		if (cancelled(confirmed) || !confirmed) return;
		if (isLocalNode) {
			try {
				plumNode('delete', r.name);
			} catch {}
		} else {
			const s = clack.spinner();
			s.start(`Deleting "${r.name}"...`);
			try {
				await deleteRunner(r.id);
				s.stop(pc.green(`Deleted "${r.name}"`));
			} catch (e) {
				s.stop(pc.red(`Could not delete "${r.name}": ${e.message}`));
			}
		}
	} else if (action === 'log') {
		clack.note(runnerProcess.loadRegistry()[r.id]?.logFile ?? '(no log file)', 'Log file');
	} else if (action === 'token') {
		clack.note(localCfg.token || '(stored on the node’s own machine)', 'Auth token');
	} else if (action === 'ping') {
		const s = clack.spinner();
		s.start(`Pinging "${r.name}"...`);
		const online = await pingRunner(r.id);
		s.stop(online ? pc.green(`"${r.name}" is reachable`) : pc.red(`"${r.name}" is unreachable`));
	}
}

async function addRunner() {
	const suggested = `node-${generateToken().slice(0, 6)}`;

	const name = await clack.text({
		message: 'Runner name',
		placeholder: suggested,
		defaultValue: suggested
	});
	if (cancelled(name)) return;

	let port;
	for (;;) {
		port = await clack.text({
			message: 'Local port this node listens on',
			placeholder: '3002',
			defaultValue: '3002'
		});
		if (cancelled(port)) return;
		const pid = findPidOnPort(Number(port));
		if (!pid) break;
		clack.log.warn(pc.yellow(`Port ${port} is already in use (pid ${pid}) — choose another.`));
	}

	const defToken = process.env.NODE_TOKEN || generateToken();
	const token = await clack.text({
		message: 'Auth token',
		placeholder: defToken,
		defaultValue: defToken
	});
	if (cancelled(token)) return;

	const defaultUrl = `http://${detectLanIp()}:${port}`;
	const urlInput = await clack.text({
		message: 'URL the Plum server uses to reach this node',
		placeholder: defaultUrl,
		defaultValue: defaultUrl
	});
	if (cancelled(urlInput)) return;

	const url = resolveNodeUrl(urlInput || defaultUrl);

	// Exactly `plum node start` — register, start on this machine, verify,
	// persist. One code path for both entry points.
	try {
		plumNode(
			'start',
			name,
			'--primary',
			API_URL,
			'--url',
			url,
			'--port',
			String(port),
			'--token',
			token,
			'--browser',
			'chromium'
		);
	} catch {
		clack.log.warn(pc.yellow('Node start reported a problem — see the output above.'));
	}
}

async function main() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Manage Runners  ')));

	if (!RUNNER_TOKEN) {
		clack.log.warn(
			'No runner token available — stop / restart / delete will be rejected.\n' +
				'Run `plum manage-runners` on the primary host, or from a folder where you started a node.'
		);
	}

	for (;;) {
		const s = clack.spinner();
		s.start(`Loading runners from ${API_URL}...`);
		let runners;
		try {
			runners = await describeRunners();
			s.stop(`Runners at ${API_URL}`);
		} catch (e) {
			s.stop(pc.red(`Could not reach Plum server at ${API_URL}`));
			clack.log.error(e.message);
			clack.outro(pc.dim('Is the primary server running? (docker compose up -d)'));
			process.exit(1);
		}

		if (runners.length === 0) clack.log.info(pc.dim('No runners registered yet.'));

		const choice = await clack.select({
			message: runners.length ? 'Select a runner' : 'No runners yet',
			options: [
				...runners.map((r) => ({
					value: r.id,
					label: r.name,
					hint: statusBadge(r)
				})),
				{ value: '__add__', label: pc.green('+ Add new runner') },
				{ value: '__refresh__', label: pc.cyan('↻ Refresh') },
				{ value: '__quit__', label: pc.dim('Quit') }
			]
		});

		if (cancelled(choice) || choice === '__quit__') break;
		if (choice === '__refresh__') continue;
		if (choice === '__add__') {
			await addRunner();
			continue;
		}

		const runner = runners.find((r) => r.id === choice);
		if (runner) await runAction(runner);
	}

	clack.outro(pc.magenta('Done.'));
}

main().catch((err) => {
	clack.log.error(err.message);
	process.exit(1);
});
