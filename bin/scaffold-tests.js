/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
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
