/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const DEFAULT_BROWSER = 'chromium';

// Stored value is the engine id; this is the brand name shown to people.
const BROWSER_LABELS = { chromium: 'Chrome', firefox: 'Firefox' };
const browserLabel = (id) => BROWSER_LABELS[id] ?? id ?? 'Chrome';

const FRAMEWORK = { PLAYWRIGHT: 'playwright', CUCUMBER: 'cucumber' };

// Selection order — this is the order the CLI and the project-create form offer.
const FRAMEWORKS = [FRAMEWORK.PLAYWRIGHT, FRAMEWORK.CUCUMBER];

// What a new project gets offered. NOT the same as the Project.framework column
// default, which stays "cucumber" until the Playwright ingestion and report UI
// are finished — a project row created without an explicit choice is a legacy
// Cucumber project, not a Playwright one.
const DEFAULT_FRAMEWORK = FRAMEWORK.PLAYWRIGHT;

const FRAMEWORK_LABELS = { playwright: 'Playwright', cucumber: 'Cucumber' };
const frameworkLabel = (id) => FRAMEWORK_LABELS[id] ?? id ?? 'Playwright';

const isFramework = (id) => FRAMEWORKS.includes(id);

module.exports = {
	DEFAULT_BROWSER,
	browserLabel,
	FRAMEWORK,
	FRAMEWORKS,
	DEFAULT_FRAMEWORK,
	frameworkLabel,
	isFramework
};
