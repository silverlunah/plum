/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// A leading =, +, or - makes a spreadsheet treat the cell as a formula. (@ is
// left alone — every Cucumber tag starts with one.)
const FORMULA_LEADS = /^[=+-]/;

function cell(value) {
	let s = value === null || value === undefined ? '' : String(value);
	if (FORMULA_LEADS.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// BOM-prefixed so Excel detects UTF-8. `rows[0]` is the header.
function toCsv(rows) {
	return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { toCsv, cell };
