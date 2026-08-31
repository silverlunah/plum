/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Registers a Plum runner node to start on machine boot / user login, using
 * whatever the platform already ships — systemd (Linux), launchd (macOS),
 * Scheduled Tasks (Windows). No extra daemon, no dependency.
 *
 * The entry just runs `plum node start <name>` — the same command a person would
 * type — so it re-registers with the primary and (re)spawns the node process.
 * Uses only Node builtins so it can be called from the published `bin/plum.js`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUM_BIN = path.resolve(__dirname, '..', '..', 'bin', 'plum.js');

function bootArgs(name) {
	return [PLUM_BIN, 'node', 'start', name];
}

function run(cmd, args) {
	execFileSync(cmd, args, { stdio: 'pipe', windowsHide: true });
}

// ── Linux: systemd --user unit ────────────────────────────────────────────────

function linuxUnitPath(name) {
	return path.join(os.homedir(), '.config', 'systemd', 'user', `plum-node-${name}.service`);
}

function hasSystemd() {
	try {
		execFileSync('systemctl', ['--user', '--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function installLinux(name) {
	if (!hasSystemd()) {
		return { ok: false, reason: 'systemd (systemctl --user) not available on this machine' };
	}
	const file = linuxUnitPath(name);
	const quote = (parts) => parts.map((a) => `"${a}"`).join(' ');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(
		file,
		[
			'[Unit]',
			`Description=Plum runner node "${name}"`,
			'After=network-online.target',
			'Wants=network-online.target',
			'',
			'[Service]',
			'Type=oneshot',
			'RemainAfterExit=yes',
			`ExecStart=${quote([process.execPath, ...bootArgs(name)])}`,
			`ExecStop=${quote([process.execPath, PLUM_BIN, 'node', 'stop', name])}`,
			'',
			'[Install]',
			'WantedBy=default.target',
			''
		].join('\n')
	);
	run('systemctl', ['--user', 'daemon-reload']);
	run('systemctl', ['--user', 'enable', `plum-node-${name}.service`]);
	return {
		ok: true,
		file,
		hint: 'Run `loginctl enable-linger` once so the node starts before you log in.'
	};
}

function removeLinux(name) {
	if (hasSystemd()) {
		try {
			run('systemctl', ['--user', 'disable', '--now', `plum-node-${name}.service`]);
		} catch {}
	}
	fs.rmSync(linuxUnitPath(name), { force: true });
	if (hasSystemd()) {
		try {
			run('systemctl', ['--user', 'daemon-reload']);
		} catch {}
	}
	return { ok: true };
}

function statusLinux(name) {
	return fs.existsSync(linuxUnitPath(name)) ? 'enabled' : 'disabled';
}

// ── macOS: launchd LaunchAgent ───────────────────────────────────────────────

function darwinLabel(name) {
	return `com.plum.node.${name}`;
}
function darwinPlistPath(name) {
	return path.join(os.homedir(), 'Library', 'LaunchAgents', `${darwinLabel(name)}.plist`);
}

function installDarwin(name) {
	const file = darwinPlistPath(name);
	const logDir = path.join(os.homedir(), '.plum', 'logs');
	fs.mkdirSync(logDir, { recursive: true });
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const argv = [process.execPath, ...bootArgs(name)]
		.map((a) => `    <string>${a.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`)
		.join('\n');
	fs.writeFileSync(
		file,
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
			'<plist version="1.0">',
			'<dict>',
			`  <key>Label</key><string>${darwinLabel(name)}</string>`,
			'  <key>ProgramArguments</key>',
			'  <array>',
			argv,
			'  </array>',
			'  <key>RunAtLoad</key><true/>',
			`  <key>StandardOutPath</key><string>${path.join(logDir, `boot-${name}.log`)}</string>`,
			`  <key>StandardErrorPath</key><string>${path.join(logDir, `boot-${name}.log`)}</string>`,
			'</dict>',
			'</plist>',
			''
		].join('\n')
	);
	try {
		run('launchctl', ['unload', file]);
	} catch {}
	run('launchctl', ['load', '-w', file]);
	return { ok: true, file };
}

function removeDarwin(name) {
	const file = darwinPlistPath(name);
	try {
		run('launchctl', ['unload', '-w', file]);
	} catch {}
	fs.rmSync(file, { force: true });
	return { ok: true };
}

function statusDarwin(name) {
	return fs.existsSync(darwinPlistPath(name)) ? 'enabled' : 'disabled';
}

// ── Windows: Scheduled Task at logon ─────────────────────────────────────────

function windowsTaskName(name) {
	return `Plum Node ${name}`;
}

function installWindows(name) {
	// schtasks takes the whole command as one /TR string; the exe paths hold
	// spaces, so each token is double-quoted inside it.
	const tr = [process.execPath, ...bootArgs(name)].map((a) => `"${a}"`).join(' ');
	run('schtasks', [
		'/Create',
		'/TN',
		windowsTaskName(name),
		'/TR',
		tr,
		'/SC',
		'ONLOGON',
		'/RL',
		'LIMITED',
		'/F'
	]);
	return { ok: true, task: windowsTaskName(name) };
}

function removeWindows(name) {
	try {
		run('schtasks', ['/Delete', '/TN', windowsTaskName(name), '/F']);
	} catch {}
	return { ok: true };
}

function statusWindows(name) {
	try {
		execFileSync('schtasks', ['/Query', '/TN', windowsTaskName(name)], { stdio: 'ignore' });
		return 'enabled';
	} catch {
		return 'disabled';
	}
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

function byPlatform(name, { linux, darwin, win32 }) {
	if (process.platform === 'linux') return linux(name);
	if (process.platform === 'darwin') return darwin(name);
	if (process.platform === 'win32') return win32(name);
	return { ok: false, reason: `boot-on-start isn't supported on ${process.platform}` };
}

function installNodeBoot(name) {
	return byPlatform(name, { linux: installLinux, darwin: installDarwin, win32: installWindows });
}

function removeNodeBoot(name) {
	return byPlatform(name, { linux: removeLinux, darwin: removeDarwin, win32: removeWindows });
}

function nodeBootStatus(name) {
	try {
		return byPlatform(name, { linux: statusLinux, darwin: statusDarwin, win32: statusWindows });
	} catch {
		return 'disabled';
	}
}

module.exports = { installNodeBoot, removeNodeBoot, nodeBootStatus };
