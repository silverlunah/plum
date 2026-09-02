/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const { FRAMEWORK } = require('../constants/defaults');

/**
 * Builds the native runner invocation for a run.
 *
 * Plum passes only two kinds of argument: which tests to run, and where to write
 * the report. Browser, workers, timeouts, traces and reporters all come from the
 * project's own playwright.config.ts / cucumber.js, so the command below is one a
 * developer can paste into a terminal and get the same run.
 *
 * Retries are the one exception. They come from the project's max-retries setting
 * rather than the config, and the two frameworks need opposite handling:
 *
 * - Playwright reports every attempt in its JSON (`results[]`), so `--retries` is
 *   passed straight through and one process produces the whole picture.
 * - Cucumber's legacy JSON formatter reports only the *final* attempt, so a native
 *   `--retry` would hide flakiness entirely. Plum re-runs failures itself instead
 *   and counts attempts across processes, which is why no retry flag is emitted
 *   here for Cucumber.
 *
 * Callers spawn this through a shell (`shell: true`), which npm/npx require on
 * Windows, so the selection values are quoted here: a tag expression contains `|`
 * or `(` `)`, which an unquoted shell reads as a pipe or a subshell rather than
 * as part of the argument.
 *
 * @returns {{ bin: string, args: string[], cwd: string, env: Record<string,string> }}
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

	if (framework === FRAMEWORK.PLAYWRIGHT) {
		const args = ['test'];
		// Tags reach Playwright as a title regex, not as tag syntax: Plum's tag
		// expression "@a or @b" becomes /@a|@b/. The @ is kept so a tag cannot
		// match a substring of an unrelated test title.
		const grep = tagsToGrep(tag);
		if (grep) args.push('--grep', shellQuote(grep));
		if (browser) args.push(`--project=${browser}`);
		if (Number(retries) > 0) args.push(`--retries=${Number(retries)}`);
		// Always passed, including 1. Playwright's own default is half the machine's
		// cores, so omitting the flag for a single worker silently ran five on a
		// 10-core box while the UI said one.
		args.push(`--workers=${Math.max(1, Number(workers) || 1)}`);
		if (shard) args.push(`--shard=${shard.index}/${shard.total}`);
		return { bin: 'playwright', args, cwd: testsRoot, env };
	}

	const args = [];
	if (tag) args.push('--tags', shellQuote(tag));
	// Only above 1: cucumber-js runs in the main process without the flag, which is
	// what one worker means. `--parallel 1` would spawn a worker process to do the
	// same work, and the project's own config already defaults to 0.
	if (Number(workers) > 1) args.push('--parallel', String(Number(workers)));
	return { bin: 'cucumber-js', args, cwd: testsRoot, env };
}

/**
 * "@a or @b" -> "@a|@b". Cucumber tag expressions also support `and` and `not`,
 * which have no regex equivalent here — an expression using them is passed to
 * Playwright as a plain OR of the tags it mentions, which over-selects rather
 * than silently running nothing.
 */
function tagsToGrep(tag) {
	const trimmed = (tag ?? '').trim();
	if (!trimmed) return '';
	const tags = trimmed.match(/@[\w-]+/g);
	if (!tags || tags.length === 0) return '';
	return tags.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

// Double quotes work in both POSIX sh and Windows cmd.exe. Any embedded double
// quote is dropped rather than escaped: the two shells disagree on how to escape
// one, and no tag or test title Plum generates contains a quote.
const shellQuote = (value) => `"${String(value).replace(/"/g, '')}"`;

module.exports = { buildRunCommand, tagsToGrep, shellQuote };
