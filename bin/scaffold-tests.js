/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fse from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const plumRoot = path.resolve(__dirname, '..');
const scaffoldPath = path.join(plumRoot, 'backend', '_scaffold');
const testsPath = path.join(plumRoot, 'backend', 'tests');

if (fs.existsSync(testsPath)) {
	console.log('⚠️  `tests/` already exists. Skipping scaffold copy.\n');
} else {
	fse.copySync(scaffoldPath, testsPath);
	console.log('✅ `tests/` initialized from scaffold.\n');
}
