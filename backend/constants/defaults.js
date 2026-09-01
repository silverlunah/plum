/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const DEFAULT_BROWSER = 'chromium';

// Stored value is the engine id; this is the brand name shown to people.
const BROWSER_LABELS = { chromium: 'Chrome', firefox: 'Firefox' };
const browserLabel = (id) => BROWSER_LABELS[id] ?? id ?? 'Chrome';

const FRAMEWORKS = ['playwright', 'cucumber'];
const DEFAULT_FRAMEWORK = 'playwright';

const FRAMEWORK_LABELS = { playwright: 'Playwright', cucumber: 'Cucumber' };
const frameworkLabel = (id) => FRAMEWORK_LABELS[id] ?? id ?? 'Playwright';

const isFramework = (id) => FRAMEWORKS.includes(id);

module.exports = {
	DEFAULT_BROWSER,
	browserLabel,
	FRAMEWORKS,
	DEFAULT_FRAMEWORK,
	frameworkLabel,
	isFramework
};
