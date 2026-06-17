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

import * as clack from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import path from 'path';

const testsRoot = process.env.TESTS_ROOT || path.join(process.cwd(), 'tests');
const stepDefsPath = path.join(testsRoot, 'step_definitions');
const pagesPath = path.join(testsRoot, 'pages');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function toMethodName(stepText) {
	return stepText
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.trim()
		.split(/\s+/)
		.map((word, i) => (i === 0 ? word : capitalize(word)))
		.join('');
}

function toClassName(name) {
	return capitalize(name.trim()) + 'Page';
}

function toStepFileName(name) {
	return capitalize(name.trim()) + 'Steps.ts';
}

function toPageFileName(name) {
	return toClassName(name) + '.ts';
}

/* ------------------------------------------------------------------ */
/*  File generators                                                    */
/* ------------------------------------------------------------------ */

function generatePageFile(pageClassName, methodName) {
	return `import { page } from '../utils/browser';

export class ${pageClassName} {
\tstatic async ${methodName}() {
\t\t// TODO: implement
\t}
}
`;
}

function generateStepFile(stepType, stepText, methodName, pageClassName, pageBaseName) {
	return `import { ${stepType} } from '@cucumber/cucumber';
import { ${pageClassName} } from '../pages/${pageBaseName}';

${stepType}('${stepText}', async () => {
\tawait ${pageClassName}.${methodName}();
});
`;
}

function appendMethodToPage(filePath, methodName) {
	let content = fs.readFileSync(filePath, 'utf8');
	const method = `\n\tstatic async ${methodName}() {\n\t\t// TODO: implement\n\t}\n`;
	const lastBrace = content.lastIndexOf('}');
	content = content.slice(0, lastBrace) + method + content.slice(lastBrace);
	fs.writeFileSync(filePath, content, 'utf8');
}

function appendStepToFile(filePath, stepType, stepText, methodName, pageClassName, pageBaseName) {
	let content = fs.readFileSync(filePath, 'utf8');

	// Update @cucumber/cucumber import to include the new step type if missing
	const cucumberImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*'@cucumber\/cucumber';/);
	if (cucumberImportMatch) {
		const existing = cucumberImportMatch[1].split(',').map((s) => s.trim());
		if (!existing.includes(stepType)) {
			const updated = [...existing, stepType].join(', ');
			content = content.replace(
				cucumberImportMatch[0],
				`import { ${updated} } from '@cucumber/cucumber';`
			);
		}
	}

	// Add page import if missing
	const pageImportLine = `import { ${pageClassName} } from '../pages/${pageBaseName}';`;
	if (!content.includes(pageImportLine)) {
		const lastImportIdx = content.lastIndexOf('\nimport ');
		const insertAt = content.indexOf('\n', lastImportIdx + 1) + 1;
		content = content.slice(0, insertAt) + pageImportLine + '\n' + content.slice(insertAt);
	}

	const stepBlock = `\n${stepType}('${stepText}', async () => {\n\tawait ${pageClassName}.${methodName}();\n});\n`;
	content = content.trimEnd() + '\n' + stepBlock;
	fs.writeFileSync(filePath, content, 'utf8');
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum — Create Step  ')));

	// 1. Step type
	const stepTypeChoice = await clack.select({
		message: 'Step type',
		options: [
			{ value: 'Given', label: 'Given', hint: 'initial context' },
			{ value: 'When', label: 'When', hint: 'action' },
			{ value: 'And', label: 'And', hint: 'continuation (uses When)' },
			{ value: 'Then', label: 'Then', hint: 'expected outcome' }
		]
	});
	if (clack.isCancel(stepTypeChoice)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}
	const stepType = stepTypeChoice === 'And' ? 'When' : stepTypeChoice;

	// 2. Step text
	const stepText = await clack.text({
		message: 'Step text',
		placeholder: 'I am on the login page',
		validate: (v) => (!v.trim() ? 'Step text is required' : undefined)
	});
	if (clack.isCancel(stepText)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}

	// 3. Step definition file
	const existingFiles = fs.existsSync(stepDefsPath)
		? fs.readdirSync(stepDefsPath).filter((f) => f.endsWith('.ts'))
		: [];

	const stepFile = await clack.select({
		message: 'Add to step definition file',
		options: [
			{ value: '__new__', label: pc.green('+ New Step Definition') },
			...existingFiles.map((f) => ({ value: f, label: f }))
		]
	});
	if (clack.isCancel(stepFile)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}

	let stepFileName;
	if (stepFile === '__new__') {
		const newName = await clack.text({
			message: 'Step definition name',
			placeholder: 'home',
			hint: 'e.g. "home" → HomeSteps.ts',
			validate: (v) => (!v.trim() ? 'Name is required' : undefined)
		});
		if (clack.isCancel(newName)) {
			clack.cancel('Cancelled.');
			process.exit(0);
		}
		stepFileName = toStepFileName(newName);
	} else {
		stepFileName = stepFile;
	}

	// 4. Page selection
	const existingPages = fs.existsSync(pagesPath)
		? fs.readdirSync(pagesPath).filter((f) => f.endsWith('.ts'))
		: [];

	const pageChoice = await clack.select({
		message: 'Which page does this step use?',
		options: [
			{ value: '__new__', label: pc.green('+ New Page') },
			...existingPages.map((f) => ({ value: f, label: f }))
		]
	});
	if (clack.isCancel(pageChoice)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}

	let pageFileName;
	if (pageChoice === '__new__') {
		const newPageName = await clack.text({
			message: 'Page name',
			placeholder: 'home',
			hint: '"Page.ts" will be appended — e.g. "home" → HomePage.ts',
			validate: (v) => (!v.trim() ? 'Page name is required' : undefined)
		});
		if (clack.isCancel(newPageName)) {
			clack.cancel('Cancelled.');
			process.exit(0);
		}
		pageFileName = toPageFileName(newPageName);
	} else {
		pageFileName = pageChoice;
	}

	const pageClassName = pageFileName.replace('.ts', '');
	const pageBaseName = pageFileName.replace('.ts', '');
	const methodName = toMethodName(stepText);

	const s = clack.spinner();
	s.start('Generating files...');

	// Handle page file
	const pageFilePath = path.join(pagesPath, pageFileName);
	fs.mkdirSync(pagesPath, { recursive: true });
	if (!fs.existsSync(pageFilePath)) {
		fs.writeFileSync(pageFilePath, generatePageFile(pageClassName, methodName), 'utf8');
		s.stop(pc.green(`✓ Created ${pageFileName}`));
	} else {
		appendMethodToPage(pageFilePath, methodName);
		s.stop(pc.cyan(`↳ Added ${methodName}() to ${pageFileName}`));
	}

	// Handle step definition file
	const stepFilePath = path.join(stepDefsPath, stepFileName);
	fs.mkdirSync(stepDefsPath, { recursive: true });
	if (!fs.existsSync(stepFilePath)) {
		fs.writeFileSync(
			stepFilePath,
			generateStepFile(stepType, stepText, methodName, pageClassName, pageBaseName),
			'utf8'
		);
		clack.log.success(pc.green(`Created ${stepFileName}`));
	} else {
		appendStepToFile(stepFilePath, stepType, stepText, methodName, pageClassName, pageBaseName);
		clack.log.info(pc.cyan(`Added step to ${stepFileName}`));
	}

	clack.note(
		[
			`${pc.dim('Step:')}  ${pc.white(`${stepType}('${stepText}')`)}`,
			`${pc.dim('Page:')}  ${pc.white(`${pageClassName}.${methodName}()`)}`,
			`${pc.dim('Files:')} ${pc.white(stepFileName)} ${pc.dim('+')} ${pc.white(pageFileName)}`
		].join('\n'),
		'Summary'
	);

	clack.outro(pc.magenta('Done! Remember to implement the page method.'));
}

main().catch((err) => {
	clack.log.error(err.message);
	process.exit(1);
});
