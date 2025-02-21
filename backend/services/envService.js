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

/* -----------------------------------------------------
 *                   .env Generator
 *  Description:
 * 		If .env file doesn't exist, this will create
 * 		a .env file in root with sauce demo's base URL
 * ------------------------------------------------------ */
const envPath = path.join(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
	const envContent = 'BASE_URL=https://www.saucedemo.com/v1/\nIS_HEADLESS=false';
	fs.writeFileSync(envPath, envContent);
	console.log('.env file created in the root directory');
} else {
	let envContent = fs.readFileSync(envPath, 'utf8');

	if (!envContent.includes('IS_HEADLESS=')) {
		envContent += '\nIS_HEADLESS=false';
		fs.writeFileSync(envPath, envContent);
		console.log('IS_HEADLESS=false added to .env');
	} else {
		console.log('.env file already contains IS_HEADLESS setting');
	}
}
