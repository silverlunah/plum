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

async function refresh() {
	const rows = await prisma.project.findMany({
		select: { id: true, slug: true, name: true, testsPath: true }
	});
	slugById = new Map(rows.map((r) => [r.id, r.slug || slugify(r.name)]));
	testsPathById = new Map(rows.map((r) => [r.id, sanitizeTestsPath(r.testsPath)]));
}

function slugFor(projectId) {
	return slugById.get(Number(projectId)) ?? null;
}

function testsPathFor(projectId) {
	return testsPathById.get(Number(projectId)) ?? DEFAULT_TESTS_PATH;
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
		if (sanitizeTestsPath(testsPath) !== DEFAULT_TESTS_PATH) continue;
		const sentinel = SCAFFOLD_SENTINEL[framework];
		if (!sentinel) continue;
		if (!fs.existsSync(path.join(target, DEFAULT_TESTS_PATH, sentinel))) {
			scaffoldProject(slug, framework);
		}
	}
}

module.exports = {
	refresh,
	slugFor,
	testsPathFor,
	scaffoldProject,
	removeProjectDir,
	reconcile,
	PROJECTS_DIR
};
