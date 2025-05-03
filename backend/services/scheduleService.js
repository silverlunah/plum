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

const SETTINGS_PATH = path.join(__dirname, '../config/settings.json');

const getAllSchedules = () => {
	try {
		const fileContent = fs.readFileSync(SETTINGS_PATH, 'utf8');
		const settings = JSON.parse(fileContent);
		return settings.cronJobSchedules || [];
	} catch (error) {
		console.error('Error reading or parsing the settings file:', error);
		return [];
	}
};

module.exports = { getAllSchedules };
