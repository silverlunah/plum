/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../services/prisma');
const { slugify } = require('./slugify');

const BACKEND_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(BACKEND_DIR, 'projects');
const SCAFFOLD_DIR = path.join(BACKEND_DIR, '_scaffold');

// id → slug, so the sync path helpers in testsRoot.js don't need a DB round trip.
// Kept fresh by refresh() on startup and after any project create/delete.
let slugById = new Map();

async function refresh() {
	const rows = await prisma.project.findMany({ select: { id: true, slug: true, name: true } });
	slugById = new Map(rows.map((r) => [r.id, r.slug || slugify(r.name)]));
}

function slugFor(projectId) {
	return slugById.get(Number(projectId)) ?? null;
}

// Copies the scaffold into projects/<slug>/tests/. `force: false` makes it a safe
// fill-in — an operator's edited files and extra tests are never overwritten.
function scaffoldProject(slug) {
	const dest = path.join(PROJECTS_DIR, slug, 'tests');
	fs.mkdirSync(dest, { recursive: true });
	fs.cpSync(SCAFFOLD_DIR, dest, { recursive: true, force: false, errorOnExist: false });
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

// Startup: every project has a projects/<slug>/tests/ folder, and a leftover
// numeric folder from the pre-slug layout is renamed to its slug.
async function reconcile() {
	await refresh();
	const rows = await prisma.project.findMany({ select: { id: true, slug: true } });
	for (const { id, slug } of rows) {
		if (!slug) continue;
		const legacy = path.join(PROJECTS_DIR, String(id));
		const target = path.join(PROJECTS_DIR, slug);
		if (fs.existsSync(legacy) && !fs.existsSync(target)) fs.renameSync(legacy, target);
		if (!fs.existsSync(path.join(target, 'tests', 'features'))) scaffoldProject(slug);
	}
}

module.exports = { refresh, slugFor, scaffoldProject, removeProjectDir, reconcile, PROJECTS_DIR };
