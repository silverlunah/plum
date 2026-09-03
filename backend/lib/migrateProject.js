/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Reports what an existing test folder still needs before Plum can run it, and
 * applies the parts that are safe to automate.
 *
 * Deliberately read-only unless asked: the folder belongs to the team, usually
 * lives in their own repo, and a wrong rewrite is a worse day than an edit made
 * by hand. Anything ambiguous is reported for a human instead of guessed at.
 */

const fs = require('fs');
const path = require('path');
const { FRAMEWORK } = require('../constants/defaults');

const SCAFFOLD_DIR = path.join(__dirname, '..', '_scaffold');
const SPEC_EXT = /\.(spec|test)\.(ts|js|mts|mjs)$/;
const SKIP_DIRS = new Set([
	'node_modules',
	'test-results',
	'playwright-report',
	'blob-report',
	'.git'
]);

const OK = 'ok';
const TODO = 'todo';
const INFO = 'info';

function walk(dir, hit) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), hit);
		} else {
			hit(path.join(dir, entry.name));
		}
	}
}

function specFiles(root) {
	const out = [];
	walk(root, (file) => {
		if (SPEC_EXT.test(path.basename(file))) out.push(file);
	});
	return out;
}

function detectFramework(root) {
	if (fs.existsSync(path.join(root, 'playwright.config.ts'))) return FRAMEWORK.PLAYWRIGHT;
	if (fs.existsSync(path.join(root, 'playwright.config.js'))) return FRAMEWORK.PLAYWRIGHT;
	if (fs.existsSync(path.join(root, 'cucumber.js'))) return FRAMEWORK.CUCUMBER;
	if (fs.existsSync(path.join(root, 'features'))) return FRAMEWORK.CUCUMBER;
	if (specFiles(root).length > 0) return FRAMEWORK.PLAYWRIGHT;
	return null;
}

const read = (file) => {
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
};

// './x' or '../x', never 'x', which TypeScript reads as a package.
function relImport(fromFile, toFile) {
	let rel = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/');
	rel = rel.replace(/\.(ts|js|mts|mjs)$/, '');
	return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * One import statement's named members, or null when the shape is anything this
 * cannot safely rewrite (namespace import, side-effect import, `require`).
 */
function playwrightTestImport(source) {
	const m = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]@playwright\/test['"]\s*;?/);
	if (!m) return null;
	const members = m[1]
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	if (!members.some((x) => x === 'test' || x.startsWith('test as '))) return null;
	return { statement: m[0], members };
}

// A local module the specs take `test` from, which is where a repo with its own
// fixtures should be rewired instead of every spec file.
function ownTestModule(root, specs) {
	const plumFixture = path.join(root, 'fixtures', 'plum.ts');
	for (const file of specs) {
		const m = read(file).match(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/);
		if (!m) continue;
		const resolved = path.resolve(path.dirname(file), m[1]);
		for (const ext of ['.ts', '.js', '.mts', '.mjs', '/index.ts', '/index.js']) {
			const candidate = resolved + ext;
			if (!fs.existsSync(candidate) || !/\.extend\s*[<(]/.test(read(candidate))) continue;
			// Plum's own fixture is not the repo's, and a module already chaining from it
			// needs nothing: both would otherwise be reported as "rewire this".
			if (path.resolve(candidate) === path.resolve(plumFixture)) continue;
			if (/from\s*['"][^'"]*fixtures\/plum['"]|from\s*['"]\.\/plum['"]/.test(read(candidate)))
				continue;
			return candidate;
		}
	}
	return null;
}

// Plum's own runner version, whose browser builds are the only ones in the image.
function plumRunnerVersion(pkg) {
	try {
		return require(`${pkg}/package.json`).version;
	} catch {
		return null;
	}
}

// A project pinning a different minor fails at launch with "Executable doesn't
// exist at .../chromium_headless_shell-<build>", because browser builds are tied
// to the runner version and the image only carries Plum's.
function versionCheck(root, pkg, checks) {
	const mine = plumRunnerVersion(pkg);
	let declared = null;
	try {
		const own = JSON.parse(read(path.join(root, 'package.json')));
		declared = own.devDependencies?.[pkg] ?? own.dependencies?.[pkg] ?? null;
	} catch {}
	if (!declared || !mine) return;
	const wanted = declared.replace(/^[^0-9]*/, '');
	const sameMinor =
		wanted.split('.').slice(0, 2).join('.') === mine.split('.').slice(0, 2).join('.');
	checks.push({
		state: sameMinor ? OK : TODO,
		title: `${pkg}: your ${declared} vs Plum's ${mine}`,
		detail: sameMinor
			? null
			: `Browser builds are tied to the runner version and the image only ships Plum's, so a run fails at launch. Pin ${pkg} to ${mine}, or run the tests on a node that has your own browsers.`,
		manual: true
	});
}

function analysePlaywright(root, checks) {
	versionCheck(root, '@playwright/test', checks);
	const fixture = path.join(root, 'fixtures', 'plum.ts');
	const hasFixture = fs.existsSync(fixture);
	checks.push({
		state: hasFixture ? OK : TODO,
		title: 'fixtures/plum.ts (session recording for replay)',
		detail: hasFixture ? null : 'Added automatically by `plum server restart`.'
	});

	const configFile = ['playwright.config.ts', 'playwright.config.js']
		.map((f) => path.join(root, f))
		.find(fs.existsSync);
	// Comments stripped: the official initializer ships its extra browser projects
	// commented out, and matching inside them listed webkit and Mobile Safari as
	// declared when a run cannot select them.
	const config = configFile
		? read(configFile)
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/^\s*\/\/.*$/gm, '')
		: '';
	const projectNames = [...config.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
	if (projectNames.length === 0) {
		checks.push({
			state: INFO,
			title: 'No browser projects declared in the config',
			detail: "Plum's browser picker has nothing to select, so runs use the config's default."
		});
	} else {
		const known = projectNames.filter((n) => n === 'chromium' || n === 'firefox');
		checks.push({
			state: known.length > 0 ? OK : INFO,
			title: `Browser projects: ${projectNames.join(', ')}`,
			detail:
				known.length > 0
					? null
					: "Plum offers chromium and firefox; neither is declared, so --project is omitted and the config's own projects run."
		});
	}

	if (/retries\s*:/.test(config)) {
		checks.push({
			state: INFO,
			title: 'Config sets `retries`',
			detail:
				"Plum passes its own --retries from the project's max-retries setting when that is above zero."
		});
	}

	const specs = specFiles(root);
	const direct = specs.filter((f) => playwrightTestImport(read(f)));
	// A namespace import or a require() takes `test` from Playwright in a shape this
	// cannot safely edit. A file importing only `expect` from there is fine and must
	// not be flagged: that is exactly what a spec looks like once its test comes from
	// a fixture.
	const unusual = specs.filter((f) => {
		const src = read(f);
		if (playwrightTestImport(src)) return false;
		if (/import\s*\*\s*as\s+\w+\s*from\s*['"]@playwright\/test['"]/.test(src)) return true;
		return /require\(\s*['"]@playwright\/test['"]\s*\)/.test(src) && /\btest\b/.test(src);
	});
	const own = ownTestModule(root, specs);

	if (specs.length === 0) {
		checks.push({ state: INFO, title: 'No spec files found', detail: `Looked under ${root}.` });
	} else if (own) {
		checks.push({
			state: TODO,
			title: `Rewire one file: ${path.relative(root, own)}`,
			detail:
				`It extends Playwright's base test, so point it at Plum instead and every spec keeps its ` +
				`current import:\n      import { test as base } from '${relImport(own, fixture)}';`,
			manual: true
		});
	} else if (direct.length > 0) {
		checks.push({
			state: TODO,
			title: `${direct.length} spec file${direct.length > 1 ? 's' : ''} import test from '@playwright/test'`,
			detail: 'Replay needs test to come from the Plum fixture. `--write` rewrites these.',
			rewrite: direct
		});
	} else {
		checks.push({ state: OK, title: 'Specs already take test from a local module' });
	}

	if (unusual.length > 0) {
		checks.push({
			state: INFO,
			title: `${unusual.length} file${unusual.length > 1 ? 's' : ''} use an import shape this cannot rewrite`,
			detail: unusual.map((f) => path.relative(root, f)).join(', '),
			manual: true
		});
	}

	// Imports are stripped first: '@playwright/test' is not a tag, and counting it
	// reported every stock repo as fully tagged.
	const tagged = specs.filter((f) => {
		const body = read(f)
			.replace(/^\s*import[^;]*;?$/gm, '')
			.replace(/require\([^)]*\)/g, '');
		return /\{\s*tag\s*:/.test(body) || /@[A-Za-z][\w-]*/.test(body);
	}).length;
	checks.push({
		state: tagged > 0 ? OK : INFO,
		title: `Tags found in ${tagged} of ${specs.length} spec files`,
		detail:
			tagged > 0
				? null
				: 'Tags are only needed to link tests to repository cases and to run by tag.'
	});
}

function analyseCucumber(root, checks) {
	versionCheck(root, 'playwright', checks);
	const configFile = path.join(root, 'cucumber.js');
	const config = fs.existsSync(configFile) ? read(configFile) : '';
	if (!config) {
		checks.push({
			state: TODO,
			title: 'No cucumber.js in this folder',
			detail:
				'Cucumber runs without one, but only a config can load the recording hooks. Create it:\n' +
				"      module.exports = { default: { require: ['features/**/*.js', 'utils/hooks.ts'] } };",
			manual: true
		});
	}

	for (const file of ['utils/browser.ts', 'utils/hooks.ts']) {
		const target = path.join(root, file);
		const present = fs.existsSync(target);
		checks.push({
			state: present ? OK : TODO,
			title: `${file} (session recording for replay)`,
			detail: present ? null : '`--write` copies it from the scaffold.',
			copy: present ? null : file
		});
	}

	const requiresHooks = /require\s*:\s*\[[^\]]*hooks/.test(config);
	if (config && !requiresHooks) {
		checks.push({
			state: TODO,
			title: 'cucumber.js does not require the hooks file',
			detail: "Add 'utils/hooks.ts' to its `require` array, or the recording hooks never load.",
			manual: true
		});
	} else if (config) {
		checks.push({ state: OK, title: 'cucumber.js requires the hooks file' });
	}

	const retry = config.match(/retry\s*:\s*(\d+)/);
	if (retry && Number(retry[1]) > 0) {
		checks.push({
			state: INFO,
			title: `cucumber.js sets retry: ${retry[1]}`,
			detail:
				"Plum re-runs failures itself from the project's max-retries setting, so these compound. Leave it at 0."
		});
	}

	let readsBrowserEnv = false;
	walk(root, (file) => {
		if (/\.(ts|js)$/.test(file) && /process\.env\.BROWSER/.test(read(file))) readsBrowserEnv = true;
	});
	checks.push({
		state: readsBrowserEnv ? OK : INFO,
		title: readsBrowserEnv
			? 'Browser launch honours process.env.BROWSER'
			: 'Nothing reads process.env.BROWSER',
		detail: readsBrowserEnv
			? null
			: "Plum's browser choice is passed as BROWSER and will otherwise be ignored, whatever the report says."
	});

	let features = 0;
	let tagged = 0;
	walk(root, (file) => {
		if (!file.endsWith('.feature')) return;
		features++;
		if (/^@/m.test(read(file))) tagged++;
	});
	checks.push({
		state: features === 0 ? INFO : tagged > 0 ? OK : INFO,
		title:
			features === 0
				? 'No .feature files found'
				: `Tags found in ${tagged} of ${features} feature files`,
		detail:
			features > 0 && tagged === 0
				? 'Tags are only needed to link scenarios to repository cases.'
				: null
	});
}

/** Analyse a tests folder. `write: true` applies the automatable fixes. */
function migrateProject(root, { write = false } = {}) {
	if (!fs.existsSync(root)) return { error: `No such folder: ${root}` };
	const framework = detectFramework(root);
	if (!framework) return { error: `Could not tell which framework ${root} uses.` };

	const checks = [];
	if (framework === FRAMEWORK.PLAYWRIGHT) analysePlaywright(root, checks);
	else analyseCucumber(root, checks);

	const applied = [];
	if (write) {
		for (const check of checks) {
			if (check.rewrite) applied.push(...rewriteImports(root, check.rewrite));
			if (check.copy) {
				const from = path.join(SCAFFOLD_DIR, framework, check.copy);
				const to = path.join(root, check.copy);
				try {
					fs.mkdirSync(path.dirname(to), { recursive: true });
					fs.copyFileSync(from, to);
					applied.push(`copied ${check.copy}`);
				} catch (e) {
					applied.push(`could not copy ${check.copy}: ${e.message}`);
				}
			}
		}
	}

	return { root, framework, checks, applied };
}

function rewriteImports(root, files) {
	const fixture = path.join(root, 'fixtures', 'plum.ts');
	const done = [];
	for (const file of files) {
		const src = read(file);
		const found = playwrightTestImport(src);
		if (!found) continue;
		const rest = found.members.filter((m) => !(m === 'test' || m.startsWith('test as ')));
		const testMember = found.members.find((m) => m === 'test' || m.startsWith('test as '));
		const lines = [`import { ${testMember} } from '${relImport(file, fixture)}';`];
		if (rest.length > 0) lines.unshift(`import { ${rest.join(', ')} } from '@playwright/test';`);
		fs.writeFileSync(file, src.replace(found.statement, lines.join('\n')), 'utf8');
		done.push(`rewrote ${path.relative(root, file)}`);
	}
	return done;
}

module.exports = { migrateProject, detectFramework };
