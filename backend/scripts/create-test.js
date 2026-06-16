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

/**
 * Scaffolds a new feature file, page object, and step definition from templates.
 *
 * Usage:  node scripts/create-test.js
 *    or:  npm run create-test     (from the backend directory)
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue) {
	return new Promise((resolve) => {
		const hint = defaultValue ? ` (default: ${defaultValue})` : '';
		rl.question(`  ${question}${hint}: `, (answer) => {
			resolve(answer.trim() || defaultValue || '');
		});
	});
}

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

async function main() {
	const testsRoot = process.env.TESTS_ROOT || path.resolve(__dirname, '..', 'tests');

	console.log('\nScaffold a new test');
	console.log('─'.repeat(40));

	const rawName = await ask('Feature name (e.g. "Cart", "Checkout")', '');
	if (!rawName) {
		console.error('\n✗ Feature name is required.\n');
		rl.close();
		process.exit(1);
	}

	const pascal = toPascalCase(rawName);
	const kebab = toKebabCase(pascal);
	const suiteTag = `@suite-${kebab}`;
	const testTag = `@test-${kebab}-1`;

	const featurePath = path.join(testsRoot, 'features', `${pascal}.feature`);
	const pagePath = path.join(testsRoot, 'pages', `${pascal}Page.ts`);
	const stepsPath = path.join(testsRoot, 'step_definitions', `${pascal}Steps.ts`);

	const conflicts = [featurePath, pagePath, stepsPath].filter(fs.existsSync);
	if (conflicts.length > 0) {
		console.error('\n✗ The following files already exist:');
		conflicts.forEach((f) => console.error(`  ${f}`));
		console.error('\nDelete them first or choose a different name.\n');
		rl.close();
		process.exit(1);
	}

	rl.close();

	const feature = `${suiteTag}
Feature: ${pascal}

  ${testTag}
  Scenario: Example scenario
    Given I am on the ${pascal} page
    When I perform an action
    Then I should see the expected result
`;

	const page = `import { page } from '../utils/browser';

export class ${pascal}Page {
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

	const steps = `import { Given, When, Then } from '@cucumber/cucumber';
import { ${pascal}Page } from '../pages/${pascal}Page';

Given('I am on the ${pascal} page', async () => {
  await ${pascal}Page.goTo();
});

When('I perform an action', async () => {
  await ${pascal}Page.performAction();
});

Then('I should see the expected result', async () => {
  await ${pascal}Page.verifyResult();
});
`;

	fs.mkdirSync(path.join(testsRoot, 'features'), { recursive: true });
	fs.mkdirSync(path.join(testsRoot, 'pages'), { recursive: true });
	fs.mkdirSync(path.join(testsRoot, 'step_definitions'), { recursive: true });

	fs.writeFileSync(featurePath, feature, 'utf8');
	fs.writeFileSync(pagePath, page, 'utf8');
	fs.writeFileSync(stepsPath, steps, 'utf8');

	console.log('\n✅ Test scaffold created:');
	console.log(`   ${featurePath}`);
	console.log(`   ${pagePath}`);
	console.log(`   ${stepsPath}`);
	console.log(`\nRun with:  npm test -- ${testTag}\n`);
}

main().catch((e) => {
	rl.close();
	console.error('\n✗', e.message);
	process.exit(1);
});
