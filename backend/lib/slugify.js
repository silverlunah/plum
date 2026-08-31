/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Project name → folder/URL slug: ASCII, lowercase, kebab-case. Accents are
// stripped ("Café" → "cafe"); apostrophes and other punctuation are dropped with
// no separator ("Jann's" → "janns"); every remaining run of spaces/dashes
// collapses to one dash. Returns '' when nothing survives (e.g. a name in a
// non-Latin script) — callers reject that.
function slugify(name) {
	return String(name)
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9\s-]+/g, '')
		.replace(/[\s-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
