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

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import runnerProcess from '../lib/runnerProcess.js';
import nodeRegister from '../lib/nodeRegister.js';

const {
	isLocalUrl,
	parsePort,
	pruneDead,
	statusOf,
	prepareEnv,
	startNode,
	stopNode,
	findPidOnPort
} = runnerProcess;
const { generateToken, registerWithPrimary, detectLanIp } = nodeRegister;

const API_URL = process.env.PLUM_API_URL || 'http://localhost:3001';

const cancelled = (v) => clack.isCancel(v);

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
	const res = await fetch(`${API_URL}/runners`);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const body = await res.json();
	return body.runners ?? [];
}

async function pingRunner(id) {
	try {
		const res = await fetch(`${API_URL}/runners/${id}/ping`, { method: 'POST' });
		const body = await res.json().catch(() => ({}));
		return body.ok === true;
	} catch {
		return false;
	}
}

async function deleteRunner(id) {
	const res = await fetch(`${API_URL}/runners/${id}`, { method: 'DELETE' });
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
	const res = await fetch(`${API_URL}/runners/${id}/${action}`, { method: 'POST' });
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
	if (!r.local) detail = pc.dim('remote');
	else if (r.managed) detail = pc.green('running');
	else if (r.online) detail = pc.yellow('running (unmanaged)');
	else detail = pc.dim('stopped');
	return `${dot} ${detail}`;
}

/**
 * Installs backend deps + the Playwright browser so a freshly started node can
 * actually launch a browser. Runs with inherited stdio (outside any spinner) so
 * npm/playwright progress is visible. A failure is surfaced but non-fatal — the
 * operator can retry or fix it manually.
 */
function prepareNodeEnv() {
	clack.log.step('Preparing node environment (deps + browsers)...');
	try {
		prepareEnv();
		clack.log.success(pc.green('Environment ready.'));
		return true;
	} catch (e) {
		clack.log.warn(pc.yellow(`Environment prep failed: ${e.message}`));
		return false;
	}
}

async function runAction(r) {
	const options = [];

	if (r.managed) {
		// Local, and this manager owns its process — control it directly by PID.
		options.push(
			{ value: 'stop', label: pc.red('Stop') },
			{ value: 'restart', label: pc.yellow('Restart') },
			{ value: 'log', label: 'Show log path' },
			{ value: 'ping', label: 'Ping' }
		);
	} else if (r.online) {
		// Remote, or local but started outside this manager (no PID to own) —
		// either way the runner's own /api/shutdown|restart endpoints are
		// reachable over the network via the primary's control routes.
		options.push(
			{ value: 'stop', label: pc.red('Stop') },
			{ value: 'restart', label: pc.yellow('Restart') },
			{ value: 'ping', label: 'Ping' }
		);
	} else if (r.local) {
		options.push({ value: 'start', label: pc.green('Start') }, { value: 'ping', label: 'Ping' });
	} else {
		options.push({ value: 'ping', label: 'Ping' });
	}

	options.push(
		{ value: 'delete', label: pc.red('Delete') },
		{ value: 'back', label: pc.dim('← Back') }
	);

	const action = await clack.select({ message: `${r.name} — ${r.url}`, options });
	if (cancelled(action) || action === 'back') return;

	const port = parsePort(r.url);

	if (action === 'start') {
		prepareNodeEnv();
		const entry = startNode({ id: r.id, port, token: r.token });
		clack.log.success(pc.green(`Started "${r.name}" on port ${port} (pid ${entry.pid})`));
	} else if (action === 'stop') {
		if (r.managed) {
			const ok = stopNode(r.id);
			clack.log.success(
				ok ? pc.green(`Stopped "${r.name}"`) : pc.dim(`"${r.name}" was not running`)
			);
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
	} else if (action === 'restart') {
		if (r.managed) {
			const s = clack.spinner();
			s.start(`Restarting "${r.name}"...`);
			stopNode(r.id);
			await new Promise((resolve) => setTimeout(resolve, 600));
			const entry = startNode({ id: r.id, port, token: r.token });
			s.stop(pc.green(`Restarted "${r.name}" (pid ${entry.pid})`));
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
	} else if (action === 'log') {
		const entry = runnerProcess.loadRegistry()[r.id];
		clack.note(entry?.logFile ?? '(no log file)', 'Log file');
	} else if (action === 'ping') {
		const s = clack.spinner();
		s.start(`Pinging "${r.name}"...`);
		const online = await pingRunner(r.id);
		s.stop(online ? pc.green(`"${r.name}" is reachable`) : pc.red(`"${r.name}" is unreachable`));
	} else if (action === 'delete') {
		const confirmed = await clack.confirm({
			message: `Delete runner "${r.name}"? This removes it from the server.`,
			initialValue: false
		});
		if (cancelled(confirmed) || !confirmed) return;
		const s = clack.spinner();
		s.start(`Deleting "${r.name}"...`);
		if (r.local) stopNode(r.id, Number(parsePort(r.url)));
		try {
			await deleteRunner(r.id);
			s.stop(pc.green(`Deleted "${r.name}"`));
		} catch (e) {
			s.stop(pc.red(`Could not delete "${r.name}": ${e.message}`));
		}
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

	const port = await clack.text({
		message: 'Local port the node listens on',
		placeholder: '3002',
		defaultValue: '3002'
	});
	if (cancelled(port)) return;

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

	const s = clack.spinner();
	s.start(`Registering "${name}" with the primary...`);
	let id;
	try {
		const res = await registerWithPrimary({
			primary: API_URL,
			name,
			url,
			token,
			browser: 'chromium'
		});
		id = res.id;
		s.stop(
			res.reused
				? pc.green(`Reusing existing runner "${name}"`)
				: pc.green(`Registered "${name}" (id ${id})`)
		);
	} catch (e) {
		s.stop(pc.red(`Could not register "${name}": ${e.message}`));
		return;
	}

	prepareNodeEnv();

	const startNow = await clack.confirm({ message: 'Start this runner now?' });
	if (!cancelled(startNow) && startNow) {
		const entry = startNode({ id, port, token });
		clack.log.success(pc.green(`Started "${name}" on port ${port} (pid ${entry.pid})`));
	}
}

async function main() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Manage Runners  ')));

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
