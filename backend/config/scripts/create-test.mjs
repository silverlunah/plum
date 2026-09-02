/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

const testsRoot = process.env.TESTS_ROOT || path.join(process.cwd(), 'tests');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toPascalCase(str) {
	return str
		.replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
		.replace(/^(.)/, (c) => c.toUpperCase());
}

function toKebabCase(str) {
	return str
		.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)
		.replace(/[-_\s]+/g, '-')
		.replace(/^-/, '');
}

// Strip a trailing "Page" suffix so "CheckoutPage" → base "Checkout",
// then we append "Page" ourselves: avoiding "CheckoutPagePage".
function stripPageSuffix(pascal) {
	return pascal.endsWith('Page') ? pascal.slice(0, -4) : pascal;
}

// The folder is the source of truth: this script runs inside a project and has no
// database to ask.
const isPlaywright = fs.existsSync(path.join(testsRoot, 'playwright.config.ts'));

/* ------------------------------------------------------------------ */
/*  File generators                                                    */
/* ------------------------------------------------------------------ */

function generateSpec(pascal, base, suiteTag, testTag) {
	return `import { test } from '../fixtures/plum';
import { ${base}Page } from '../pages/${base}Page';

test.describe('${pascal}', { tag: '${suiteTag}' }, () => {
	test.describe.configure({ mode: 'parallel' });

	let ${base.toLowerCase()}: ${base}Page;

	test.beforeEach(async ({ page, step }) => {
		${base.toLowerCase()} = new ${base}Page(page);
		await step('I am on the ${pascal} page', () => ${base.toLowerCase()}.goTo());
	});

	test('Example test', { tag: '${testTag}' }, async ({ step }) => {
		await step('I perform an action', () => ${base.toLowerCase()}.performAction());
		await step('I should see the expected result', () => ${base.toLowerCase()}.verifyResult());
	});
});
`;
}

function generatePlaywrightPage(base) {
	return `import { Page } from '@playwright/test';

export class ${base}Page {
	constructor(private readonly page: Page) {}

	async goTo() {
		// Relative: baseURL comes from playwright.config.ts.
		await this.page.goto('/');
	}

	async performAction() {
		// TODO: implement
	}

	async verifyResult() {
		// TODO: implement
	}
}
`;
}

function generateFeature(pascal, suiteTag, testTag) {
	return `${suiteTag}
Feature: ${pascal}

  ${testTag}
  Scenario: Example scenario
    Given I am on the ${pascal} page
    When I perform an action
    Then I should see the expected result
`;
}

function generatePage(base) {
	return `import { page } from '../utils/browser';

export class ${base}Page {
  static async goTo() {
    await page().goto(process.env.BASE_URL as string);
  }

  static async performAction() {
    // TODO: implement
  }

  static async verifyResult() {
    // TODO: implement
  }
}
`;
}

function generateSteps(pascal, base) {
	return `import { Given, When, Then } from '@cucumber/cucumber';
import { ${base}Page } from '../pages/${base}Page';

Given('I am on the ${pascal} page', async () => {
  await ${base}Page.goTo();
});

When('I perform an action', async () => {
  await ${base}Page.performAction();
});

Then('I should see the expected result', async () => {
  await ${base}Page.verifyResult();
});
`;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Create Test  ')));

	// --name skips the prompt, so this is scriptable as well as interactive.
	const flagIndex = process.argv.indexOf('--name');
	const flagName = flagIndex !== -1 ? process.argv[flagIndex + 1] : undefined;

	const rawName =
		flagName ??
		(await clack.text({
			message: isPlaywright ? 'Test name' : 'Feature name',
			placeholder: 'Checkout, LoginPage, Cart…',
			hint: isPlaywright
				? 'Creates a .spec.ts and Page.ts'
				: 'Creates a .feature, Steps.ts and Page.ts',
			validate: (v) => (!v.trim() ? 'A name is required' : undefined)
		}));
	if (clack.isCancel(rawName)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}
	if (!String(rawName).trim()) {
		clack.log.error('A name is required: pass one with --name, or run without flags.');
		process.exit(1);
	}

	const pascal = toPascalCase(rawName.trim());
	const base = stripPageSuffix(pascal); // "CheckoutPage" → "Checkout", "Cart" → "Cart"
	const kebab = toKebabCase(pascal);
	const suiteTag = `@suite-${kebab}`;
	const testTag = `@test-${kebab}-1`;

	const specPath = path.join(testsRoot, 'specs', `${pascal}.spec.ts`);
	const featurePath = path.join(testsRoot, 'features', `${pascal}.feature`);
	const pagePath = path.join(testsRoot, 'pages', `${base}Page.ts`);
	const stepsPath = path.join(testsRoot, 'step_definitions', `${pascal}Steps.ts`);

	const planned = isPlaywright ? [specPath, pagePath] : [featurePath, pagePath, stepsPath];
	const conflicts = planned.filter(fs.existsSync);
	if (conflicts.length > 0) {
		clack.log.error('The following files already exist:');
		conflicts.forEach((f) => clack.log.warn(`  ${path.relative(process.cwd(), f)}`));
		clack.cancel('Delete them first or choose a different name.');
		process.exit(1);
	}

	const s = clack.spinner();
	s.start('Generating files…');

	fs.mkdirSync(path.join(testsRoot, 'pages'), { recursive: true });

	if (isPlaywright) {
		fs.mkdirSync(path.join(testsRoot, 'specs'), { recursive: true });
		fs.writeFileSync(specPath, generateSpec(pascal, base, suiteTag, testTag), 'utf8');
		fs.writeFileSync(pagePath, generatePlaywrightPage(base), 'utf8');
	} else {
		fs.mkdirSync(path.join(testsRoot, 'features'), { recursive: true });
		fs.mkdirSync(path.join(testsRoot, 'step_definitions'), { recursive: true });
		fs.writeFileSync(featurePath, generateFeature(pascal, suiteTag, testTag), 'utf8');
		fs.writeFileSync(pagePath, generatePage(base), 'utf8');
		fs.writeFileSync(stepsPath, generateSteps(pascal, base), 'utf8');
	}

	s.stop(pc.green('✓ Files created'));

	const rel = (p) => path.relative(process.cwd(), p);

	const runCommand = isPlaywright
		? `npx playwright test --grep ${testTag}`
		: `npx cucumber-js --tags ${testTag}`;

	clack.note(
		[
			...(isPlaywright
				? [`${pc.dim('Spec:')}     ${pc.white(rel(specPath))}`]
				: [
						`${pc.dim('Feature:')}  ${pc.white(rel(featurePath))}`,
						`${pc.dim('Steps:')}    ${pc.white(rel(stepsPath))}`
					]),
			`${pc.dim('Page:')}     ${pc.white(rel(pagePath))}`,
			'',
			`${pc.dim('Suite tag:')} ${pc.cyan(suiteTag)}`,
			`${pc.dim('Test tag:')}  ${pc.cyan(testTag)}`,
			'',
			`${pc.bold('Run with:')}  ${pc.cyan(runCommand)}`
		].join('\n'),
		`${pascal} scaffold`
	);

	clack.outro(
		pc.magenta(
			isPlaywright
				? 'Done! Fill in the steps and implement the page methods.'
				: 'Done! Fill in your scenarios and implement the page methods.'
		)
	);
}

main().catch((err) => {
	clack.log.error(err.message);
	process.exit(1);
});
