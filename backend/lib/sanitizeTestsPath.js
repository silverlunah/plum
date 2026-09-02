/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const path = require('path');

const DEFAULT_TESTS_PATH = 'tests';

// A project's tests folder is always a relative subpath *inside* projects/<slug>/
//: the container only bind-mounts that tree. Reduce any input to a safe POSIX
// subpath, or fall back to the default: reject absolutes, `..`, and drive letters.
function sanitizeTestsPath(input) {
	if (typeof input !== 'string') return DEFAULT_TESTS_PATH;
	const cleaned = input
		.trim()
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '');
	if (!cleaned || /^[a-zA-Z]:/.test(cleaned)) return DEFAULT_TESTS_PATH;
	const segments = cleaned.split('/').filter(Boolean);
	if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
		return DEFAULT_TESTS_PATH;
	}
	const normalised = path.posix.normalize(segments.join('/'));
	if (normalised.startsWith('..') || path.posix.isAbsolute(normalised)) return DEFAULT_TESTS_PATH;
	return normalised;
}

module.exports = { sanitizeTestsPath, DEFAULT_TESTS_PATH };
