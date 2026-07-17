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
// then we append "Page" ourselves — avoiding "CheckoutPagePage".
function stripPageSuffix(pascal) {
	return pascal.endsWith('Page') ? pascal.slice(0, -4) : pascal;
}

/* ------------------------------------------------------------------ */
/*  File generators                                                    */
/* ------------------------------------------------------------------ */

function generateFeature(pascal, kebab, suiteTag, testTag) {
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

function generateSteps(pascal, base, kebab) {
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
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Create Test  ')));

	const rawName = await clack.text({
		message: 'Feature name',
		placeholder: 'Checkout, LoginPage, Cart…',
		hint: 'Creates a .feature, Steps.ts and Page.ts',
		validate: (v) => (!v.trim() ? 'Feature name is required' : undefined)
	});
	if (clack.isCancel(rawName)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}

	const pascal = toPascalCase(rawName.trim());
	const base = stripPageSuffix(pascal); // "CheckoutPage" → "Checkout", "Cart" → "Cart"
	const kebab = toKebabCase(pascal);
	const suiteTag = `@suite-${kebab}`;
	const testTag = `@test-${kebab}-1`;

	const featurePath = path.join(testsRoot, 'features', `${pascal}.feature`);
	const pagePath = path.join(testsRoot, 'pages', `${base}Page.ts`);
	const stepsPath = path.join(testsRoot, 'step_definitions', `${pascal}Steps.ts`);

	const conflicts = [featurePath, pagePath, stepsPath].filter(fs.existsSync);
	if (conflicts.length > 0) {
		clack.log.error('The following files already exist:');
		conflicts.forEach((f) => clack.log.warn(`  ${path.relative(process.cwd(), f)}`));
		clack.cancel('Delete them first or choose a different name.');
		process.exit(1);
	}

	const s = clack.spinner();
	s.start('Generating files…');

	fs.mkdirSync(path.join(testsRoot, 'features'), { recursive: true });
	fs.mkdirSync(path.join(testsRoot, 'pages'), { recursive: true });
	fs.mkdirSync(path.join(testsRoot, 'step_definitions'), { recursive: true });

	fs.writeFileSync(featurePath, generateFeature(pascal, kebab, suiteTag, testTag), 'utf8');
	fs.writeFileSync(pagePath, generatePage(base), 'utf8');
	fs.writeFileSync(stepsPath, generateSteps(pascal, base, kebab), 'utf8');

	s.stop(pc.green('✓ Files created'));

	const rel = (p) => path.relative(process.cwd(), p);

	clack.note(
		[
			`${pc.dim('Feature:')}  ${pc.white(rel(featurePath))}`,
			`${pc.dim('Page:')}     ${pc.white(rel(pagePath))}`,
			`${pc.dim('Steps:')}    ${pc.white(rel(stepsPath))}`,
			'',
			`${pc.dim('Suite tag:')} ${pc.cyan(suiteTag)}`,
			`${pc.dim('Test tag:')}  ${pc.cyan(testTag)}`,
			'',
			`${pc.bold('Run with:')}  ${pc.cyan(`plum run-test ${testTag}`)}`
		].join('\n'),
		`${pascal} scaffold`
	);

	clack.outro(pc.magenta('Done! Fill in your scenarios and implement the page methods.'));
}

main().catch((err) => {
	clack.log.error(err.message);
	process.exit(1);
});
