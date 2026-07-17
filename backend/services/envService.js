/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const fs = require('fs');
const path = require('path');
const pc = require('picocolors');

const envPath = path.join(__dirname, '../.env');

if (!fs.existsSync(envPath)) {
	const envContent = 'BASE_URL=https://www.saucedemo.com/v1/\nIS_HEADLESS=false';
	fs.writeFileSync(envPath, envContent);
	console.log(pc.green('✓') + ' .env created with default values.');
} else {
	let envContent = fs.readFileSync(envPath, 'utf8');
	if (!envContent.includes('IS_HEADLESS=')) {
		envContent += '\nIS_HEADLESS=false';
		fs.writeFileSync(envPath, envContent);
		console.log(pc.cyan('↳') + ' IS_HEADLESS=false added to .env.');
	} else {
		console.log(pc.yellow('⚠') + ' .env already exists. Skipping.');
	}
}
