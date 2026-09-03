/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../services/prisma');
const { slugify } = require('./slugify');
const { sanitizeTestsPath, DEFAULT_TESTS_PATH } = require('./sanitizeTestsPath');
const { FRAMEWORK } = require('../constants/defaults');

const BACKEND_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(BACKEND_DIR, 'projects');
const SCAFFOLD_DIR = path.join(BACKEND_DIR, '_scaffold');

// The file that only exists once a framework's scaffold has been laid down.
// Checked instead of "is the folder empty", so an operator who deleted the
// example tests but kept their own doesn't get the scaffold copied back over.
const SCAFFOLD_SENTINEL = {
	[FRAMEWORK.CUCUMBER]: 'features',
	[FRAMEWORK.PLAYWRIGHT]: 'playwright.config.ts'
};

const scaffoldDirFor = (framework) => path.join(SCAFFOLD_DIR, framework);

// Never copy build or dependency folders out of the scaffold, so a stray one there
// cannot end up in every project.
const UNCOPYABLE = new Set(['node_modules', 'test-results', 'playwright-report', 'blob-report']);
const copyable = (src) => !UNCOPYABLE.has(path.basename(src));

// Does this folder already hold somebody's tests? The scaffold sentinel alone was
// not enough: an adopted repo keeps its config at its own root, so a tests folder
// full of specs looked unscaffolded and got the whole scaffold written into it,
// after which Plum's config governed and the repo's own tests never ran.
const TEST_FILE = /\.(spec|test)\.(ts|js|mts|mjs|tsx|jsx)$|\.feature$/;
function holdsTests(dir) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (UNCOPYABLE.has(entry.name) || entry.name === '.git') continue;
			if (holdsTests(path.join(dir, entry.name))) return true;
		} else if (TEST_FILE.test(entry.name)) {
			return true;
		}
	}
	return false;
}

// id → slug / tests subpath, so the sync path helpers in testsRoot.js don't need
// a DB round trip. Kept fresh by refresh() on startup and after any project
// create / delete / settings save.
let slugById = new Map();
let testsPathById = new Map();
let frameworkById = new Map();

async function refresh() {
	const rows = await prisma.project.findMany({
		select: { id: true, slug: true, name: true, testsPath: true, framework: true }
	});
	slugById = new Map(rows.map((r) => [r.id, r.slug || slugify(r.name)]));
	testsPathById = new Map(rows.map((r) => [r.id, sanitizeTestsPath(r.testsPath)]));
	frameworkById = new Map(rows.map((r) => [r.id, r.framework]));
}

function slugFor(projectId) {
	return slugById.get(Number(projectId)) ?? null;
}

function testsPathFor(projectId) {
	return testsPathById.get(Number(projectId)) ?? DEFAULT_TESTS_PATH;
}

// Cached alongside slug and testsPath so the sync path/discovery helpers don't
// need a DB round trip. Falls back to Cucumber: a project this cache has not seen
// predates the column, and every project that predates it is a Cucumber one.
function frameworkFor(projectId) {
	return frameworkById.get(Number(projectId)) ?? FRAMEWORK.CUCUMBER;
}

// Copies the framework's scaffold into projects/<slug>/tests/. `force: false`
// makes it a safe fill-in: an operator's edited files and extra tests are never
// overwritten.
//
// The runner config (playwright.config.ts / cucumber.js) is laid down at the root
// of the tests folder, not the project folder, because that folder is what a run
// executes from and it is the part a project may relocate via testsPath.
function scaffoldProject(slug, framework) {
	const src = scaffoldDirFor(framework);
	if (!fs.existsSync(src)) return;
	const dest = path.join(PROJECTS_DIR, slug, 'tests');
	fs.mkdirSync(dest, { recursive: true });
	fs.cpSync(src, dest, {
		recursive: true,
		force: false,
		errorOnExist: false,
		filter: copyable
	});
	// Shipped as `gitignore`: npm strips a file literally named .gitignore from the
	// published tarball, so it can only reach a project under another name.
	const ignoreSrc = path.join(dest, 'gitignore');
	const ignoreDest = path.join(dest, '.gitignore');
	if (fs.existsSync(ignoreSrc) && !fs.existsSync(ignoreDest)) {
		fs.renameSync(ignoreSrc, ignoreDest);
	}
	const env = path.join(dest, '.env');
	if (!fs.existsSync(env)) {
		try {
			fs.copyFileSync(path.join(dest, '.env.example'), env);
		} catch {}
	}
}

// The files a run cannot start without, as opposed to the example tests. A
// project that predates project-owned runner configs has none of these, and
// full scaffolding is skipped for it because its example tests already exist,
// so these are filled in separately, on every boot, for every project.
// tsconfig.json is required, not optional: its "ts-node": { transpileOnly }
// is what lets `npx cucumber-js` run without type-checking the suite. Plum used
// to inject TS_NODE_TRANSPILE_ONLY into the spawn env instead, so a project run
// by hand would fail on any pre-existing type error.
const REQUIRED_FILES = {
	// utils/hooks.ts and utils/browser.ts are what record the session for replay, the
	// Cucumber equivalent of fixtures/plum.ts below. They stay inert until the
	// project's cucumber.js requires them, so filling them in is safe either way.
	[FRAMEWORK.CUCUMBER]: [
		'cucumber.js',
		'package.json',
		'tsconfig.json',
		'utils/browser.ts',
		'utils/hooks.ts'
	],
	// fixtures/plum.ts is what records the session for report replay, so a project
	// without it produces reports that silently have no video.
	[FRAMEWORK.PLAYWRIGHT]: [
		'playwright.config.ts',
		'package.json',
		'tsconfig.json',
		'fixtures/plum.ts'
	]
};

// Never overwrites: a project that has edited its own cucumber.js keeps it.
// A relocated tests folder usually sits inside a repo that already declares these
// higher up (a monorepo root). Writing our own copy there shadows that install and
// duplicates node_modules, so these two are only filled in when nothing above the
// folder provides them. Anything the tree above lacks is still added.
// The runner config is inheritable too: injecting a second one into a tests folder
// whose repo already has one above it gives the run a config the team never wrote,
// and it wins because a run executes from the tests folder.
const INHERITABLE = new Set([
	'package.json',
	'tsconfig.json',
	'playwright.config.ts',
	'cucumber.js'
]);

function providedAbove(projectRoot, dest, file) {
	let dir = path.dirname(dest);
	for (;;) {
		if (fs.existsSync(path.join(dir, file))) return true;
		if (dir === projectRoot || !dir.startsWith(projectRoot)) return false;
		const parent = path.dirname(dir);
		if (parent === dir) return false;
		dir = parent;
	}
}

function ensureRunnerConfig(slug, framework, testsPath = DEFAULT_TESTS_PATH) {
	const src = scaffoldDirFor(framework);
	const projectRoot = path.join(PROJECTS_DIR, slug);
	const dest = path.join(projectRoot, testsPath);
	if (!fs.existsSync(src) || !fs.existsSync(dest)) return [];
	const added = [];
	for (const file of REQUIRED_FILES[framework] ?? []) {
		const target = path.join(dest, file);
		if (fs.existsSync(target)) continue;
		if (INHERITABLE.has(file) && providedAbove(projectRoot, dest, file)) continue;
		try {
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.copyFileSync(path.join(src, file), target);
			added.push(file);
		} catch {
			// the scaffold has no such file for this framework, nothing to fill in
		}
	}
	return added;
}

// Deletes projects/<slug>/ entirely: the project and its tests are gone.
function removeProjectDir(slug) {
	if (slug) fs.rmSync(path.join(PROJECTS_DIR, slug), { recursive: true, force: true });
}

// Startup: a leftover numeric folder from the pre-slug layout is renamed to its
// slug, and a default-layout project with no tests/ yet is scaffolded. A project
// with a custom testsPath owns that folder itself and is never scaffolded.
//
// "Has it been scaffolded yet" is answered by the framework's own sentinel file.
// Looking for features/ regardless of framework would re-scaffold a Playwright
// project on every single boot, since it has no features/ and never will.
async function reconcile() {
	await refresh();
	const rows = await prisma.project.findMany({
		select: { id: true, slug: true, testsPath: true, framework: true }
	});
	for (const { id, slug, testsPath, framework } of rows) {
		if (!slug) continue;
		const legacy = path.join(PROJECTS_DIR, String(id));
		const target = path.join(PROJECTS_DIR, slug);
		if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.renameSync(legacy, target);
		// A relocated testsPath is the project's own folder, never scaffolded, but it
		// still needs a runner config to be runnable at all.
		const relative = sanitizeTestsPath(testsPath);
		if (relative === DEFAULT_TESTS_PATH) {
			const sentinel = SCAFFOLD_SENTINEL[framework];
			const testsDir = path.join(target, relative);
			if (sentinel && !fs.existsSync(path.join(testsDir, sentinel)) && !holdsTests(testsDir)) {
				scaffoldProject(slug, framework);
			}
		}
		const added = ensureRunnerConfig(slug, framework, relative);
		if (added.length > 0) {
			console.log(`[projects] ${slug}: added ${added.join(', ')}`);
		}
	}
}

module.exports = {
	refresh,
	slugFor,
	testsPathFor,
	frameworkFor,
	scaffoldProject,
	ensureRunnerConfig,
	removeProjectDir,
	reconcile,
	PROJECTS_DIR
};
