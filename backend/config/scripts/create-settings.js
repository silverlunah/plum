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

const fs = require('fs');
const path = require('path');
const fse = require('fs-extra'); // fs-extra for directory copying

// Path to the settings.json file inside the backend/config directory
const settingsFilePath = path.join(process.cwd(), 'config', 'settings.json');
const scaffoldFolderPath = path.join(process.cwd(), '_scaffold');
const userTestsFolderPath = path.join(process.cwd(), 'tests');

// Check if the settings.json file exists
if (!fs.existsSync(settingsFilePath)) {
	console.log('⚠️ settings.json not found. Creating it with default values...');

	// Default content for settings.json
	const settingsContent = JSON.stringify(
		{
			reportsHistory: 20,
			cronJobSchedules: [
				{ label: 'Every minute', value: '* * * * *' },
				{ label: 'Every hour', value: '0 * * * *' },
				{ label: 'Every midnight', value: '0 0 * * *' },
				{ label: 'Every Sunday', value: '0 0 * * 0' }
			]
		},
		null,
		2
	);

	// Write the settings to the settings.json file
	fs.writeFileSync(settingsFilePath, settingsContent, 'utf8');
	console.log('✅ settings.json created with default values.');
} else {
	console.log('⚠️ settings.json already exists. Skipping creation.');
}

// Check if the tests folder exists, if not, copy the scaffold folder as tests
if (!fs.existsSync(userTestsFolderPath)) {
	console.log('🧪 `tests/` folder not found. Creating `tests/` from the scaffold folder...');
	fse.copySync(scaffoldFolderPath, userTestsFolderPath);
	console.log('✅ `tests/` folder created from scaffold.');
} else {
	console.log('⚠️ `tests/` folder already exists. Skipping creation.');
}
