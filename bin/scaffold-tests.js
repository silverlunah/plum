/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Seeds backend/tests/ for a from-source checkout. Server projects live in
// projects/<slug>/tests/ and are scaffolded by the backend itself; this is only the
// legacy single-folder layout the container still expects to exist.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fse from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const plumRoot = path.resolve(__dirname, '..');
const { DEFAULT_FRAMEWORK, isFramework } = require(
	path.join(plumRoot, 'backend', 'constants', 'defaults.js')
);

// One framework's scaffold, not the whole _scaffold tree: copying that produces
// tests/cucumber/ and tests/playwright/, which is not a runnable tests folder.
const flagIndex = process.argv.indexOf('--framework');
const asked = flagIndex !== -1 ? process.argv[flagIndex + 1] : undefined;
const framework = isFramework(asked) ? asked : DEFAULT_FRAMEWORK;

const scaffoldPath = path.join(plumRoot, 'backend', '_scaffold', framework);
const testsPath = path.join(plumRoot, 'backend', 'tests');

if (fs.existsSync(testsPath)) {
	console.log('⚠️  `tests/` already exists. Skipping scaffold copy.\n');
} else {
	fse.copySync(scaffoldPath, testsPath);
	// Shipped as `gitignore`: npm strips a file named .gitignore from the tarball.
	const ignoreSrc = path.join(testsPath, 'gitignore');
	if (fs.existsSync(ignoreSrc)) fs.renameSync(ignoreSrc, path.join(testsPath, '.gitignore'));
	const env = path.join(testsPath, '.env');
	if (!fs.existsSync(env)) fs.copyFileSync(path.join(testsPath, '.env.example'), env);
	console.log(`✅ \`tests/\` initialized from the ${framework} scaffold.\n`);
}
