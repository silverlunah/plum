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
const fse = require('fs-extra');
const pc = require('picocolors');

const settingsFilePath = path.join(process.cwd(), 'config', 'settings.json');
const scaffoldFolderPath = path.join(process.cwd(), '_scaffold');
const userTestsFolderPath = path.join(process.cwd(), 'tests');

if (!fs.existsSync(settingsFilePath)) {
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
	fs.writeFileSync(settingsFilePath, settingsContent, 'utf8');
	console.log(pc.green('✓') + ' settings.json created with default values.');
} else {
	console.log(pc.yellow('⚠') + ' settings.json already exists. Skipping creation.');
}

if (!fs.existsSync(userTestsFolderPath)) {
	console.log(pc.cyan('↳') + ' tests/ not found. Creating from scaffold...');
	fse.copySync(scaffoldFolderPath, userTestsFolderPath);
	console.log(pc.green('✓') + ' tests/ created from scaffold.');
} else {
	console.log(pc.yellow('⚠') + ' tests/ already exists. Skipping creation.');
}
