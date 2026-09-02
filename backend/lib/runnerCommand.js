/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');
const { FRAMEWORK, isBrowser } = require('../constants/defaults');

const BACKEND_DIR = path.resolve(__dirname, '..');

// Each runner's CLI is a plain JS entry point, so Plum spawns node against it
// directly instead of going through `npx` and a shell. That is what makes a tag or
// browser name impossible to inject: every value below is one argv element, never
// part of a command string. It also avoids the Windows .cmd-wrapper problem, since
// process.execPath needs no shell.
// Located via each package's own package.json rather than a deep path, because a
// package's `exports` map can refuse a subpath (Cucumber's does for bin/).
const CLI_ENTRY = {
	[FRAMEWORK.PLAYWRIGHT]: { pkg: '@playwright/test', bin: 'cli.js' },
	[FRAMEWORK.CUCUMBER]: { pkg: '@cucumber/cucumber', bin: path.join('bin', 'cucumber.js') }
};

// Resolved from the project first, so a project pinning its own runner version gets
// that one, then from the backend, which always has both installed.
function resolveCli(framework, testsRoot) {
	const { pkg, bin } = CLI_ENTRY[framework];
	const manifest = require.resolve(`${pkg}/package.json`, { paths: [testsRoot, BACKEND_DIR] });
	return path.join(path.dirname(manifest), bin);
}

/**
 * Builds the runner invocation for a run: which tests, and where the report goes.
 * Browser, workers, timeouts, traces and reporters come from the project's own
 * config, so this is a command a developer can reproduce by hand.
 *
 * Retries are the exception. They come from the project's max-retries setting, and
 * the two frameworks need opposite handling: Playwright reports every attempt in
 * its JSON so `--retries` is passed through, while Cucumber's legacy JSON reports
 * only the final attempt, so Plum re-runs failures itself and emits no retry flag.
 *
 * @returns {{ command: string, args: string[], cwd: string, env: Record<string,string> }}
 */
function buildRunCommand({
	framework,
	testsRoot,
	reportFile,
	tag = '',
	browser,
	workers = 1,
	retries = 0,
	shard = null
}) {
	const env = { PLUM_REPORT_FILE: reportFile };
	const cli = resolveCli(framework, testsRoot);
	const workerCount = Math.max(1, Number(workers) || 1);

	if (framework === FRAMEWORK.PLAYWRIGHT) {
		const args = [cli, 'test'];
		const grep = tagsToGrep(tag);
		if (grep) args.push('--grep', grep);
		// Validated rather than trusted: it arrives from a run request, and an
		// unknown value would otherwise reach the runner verbatim.
		if (isBrowser(browser)) args.push(`--project=${browser}`);
		if (Number(retries) > 0) args.push(`--retries=${Number(retries)}`);
		// Always passed: Playwright's own default is half the machine's cores, so
		// omitting it for a single worker silently runs several.
		args.push(`--workers=${workerCount}`);
		if (shard) args.push(`--shard=${Number(shard.index)}/${Number(shard.total)}`);
		return { command: process.execPath, args, cwd: testsRoot, env };
	}

	const args = [cli];
	if (tag) args.push('--tags', tag);
	// Only above 1: cucumber-js runs in the main process without the flag, which is
	// what one worker means.
	if (workerCount > 1) args.push('--parallel', String(workerCount));
	return { command: process.execPath, args, cwd: testsRoot, env };
}

/**
 * "@a or @b" -> "@a|@b". Cucumber's `and` and `not` have no regex equivalent, so an
 * expression using them becomes a plain OR of the tags it mentions, which
 * over-selects rather than silently running nothing.
 */
function tagsToGrep(tag) {
	const tags = (tag ?? '').trim().match(/@[\w-]+/g);
	if (!tags || tags.length === 0) return '';
	// The trailing guard matters: without it @TC-1 also matches @TC-10, so the same
	// Plum tag would select a different set on Playwright than on Cucumber, whose
	// --tags is exact. No escaping is needed, the capture is only @, word chars and -.
	return tags.map((t) => `${t}(?![\\w-])`).join('|');
}

/** The command as a reader of the run log would type it, minus the resolved CLI path. */
function describeCommand({ args }) {
	const [cli, ...rest] = args;
	const name = /playwright/.test(cli) ? 'playwright' : 'cucumber-js';
	return [name, ...rest].join(' ');
}

module.exports = { buildRunCommand, describeCommand };
