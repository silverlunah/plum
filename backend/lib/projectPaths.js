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
// makes it a safe fill-in — an operator's edited files and extra tests are never
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
	fs.cpSync(src, dest, { recursive: true, force: false, errorOnExist: false });
	const env = path.join(dest, '.env');
	if (!fs.existsSync(env)) {
		try {
			fs.copyFileSync(path.join(dest, '.env.example'), env);
		} catch {}
	}
}

// The files a run cannot start without, as opposed to the example tests. A
// project that predates project-owned runner configs has none of these, and
// full scaffolding is skipped for it because its example tests already exist —
// so these are filled in separately, on every boot, for every project.
// tsconfig.json is required, not optional: its "ts-node": { transpileOnly }
// is what lets `npx cucumber-js` run without type-checking the suite. Plum used
// to inject TS_NODE_TRANSPILE_ONLY into the spawn env instead, so a project run
// by hand would fail on any pre-existing type error.
const REQUIRED_FILES = {
	[FRAMEWORK.CUCUMBER]: ['cucumber.js', 'package.json', 'tsconfig.json'],
	[FRAMEWORK.PLAYWRIGHT]: ['playwright.config.ts', 'package.json', 'tsconfig.json']
};

// Never overwrites: a project that has edited its own cucumber.js keeps it.
function ensureRunnerConfig(slug, framework, testsPath = DEFAULT_TESTS_PATH) {
	const src = scaffoldDirFor(framework);
	const dest = path.join(PROJECTS_DIR, slug, testsPath);
	if (!fs.existsSync(src) || !fs.existsSync(dest)) return [];
	const added = [];
	for (const file of REQUIRED_FILES[framework] ?? []) {
		const target = path.join(dest, file);
		if (fs.existsSync(target)) continue;
		try {
			fs.copyFileSync(path.join(src, file), target);
			added.push(file);
		} catch {
			// the scaffold has no such file for this framework — nothing to fill in
		}
	}
	return added;
}

// Deletes projects/<slug>/ entirely — the project and its tests are gone.
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
		// A relocated testsPath is the project's own folder — never scaffolded, but it
		// still needs a runner config to be runnable at all.
		const relative = sanitizeTestsPath(testsPath);
		if (relative === DEFAULT_TESTS_PATH) {
			const sentinel = SCAFFOLD_SENTINEL[framework];
			if (sentinel && !fs.existsSync(path.join(target, relative, sentinel))) {
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
