/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
	return `import { Page } from '@playwright/test';

export class ${pageClassName} {
\tconstructor(private readonly page: Page) {}

\tasync ${methodName}() {
\t\t// TODO: implement
\t}
}
`;
}

function generateStepFile(stepType, stepText, methodName, pageClassName, pageBaseName) {
	return `import { ${stepType} } from '@cucumber/cucumber';
import { ${pageClassName} } from '../pages/${pageBaseName}';
import { PlumWorld } from '../utils/world';

${stepType}('${stepText}', async function (this: PlumWorld) {
\tawait new ${pageClassName}(this.page).${methodName}();
});
`;
}

function generateStepFileInline(stepType, stepText) {
	return `import { ${stepType} } from '@cucumber/cucumber';
import { PlumWorld } from '../utils/world';

${stepType}('${stepText}', async function (this: PlumWorld) {
\t// TODO: implement, this.page is the scenario's page
});
`;
}

function appendMethodToPage(filePath, methodName) {
	let content = fs.readFileSync(filePath, 'utf8');
	const method = `\n\tasync ${methodName}() {\n\t\t// TODO: implement\n\t}\n`;
	const lastBrace = content.lastIndexOf('}');
	content = content.slice(0, lastBrace) + method + content.slice(lastBrace);
	fs.writeFileSync(filePath, content, 'utf8');
}

function appendStepToFile(filePath, stepType, stepText, methodName, pageClassName, pageBaseName) {
	let content = fs.readFileSync(filePath, 'utf8');
	content = ensureCucumberImport(content, stepType);
	content = ensureWorldImport(content);

	// Add page import if missing, and call the page method. Passing a null
	// pageClassName inlines a TODO body instead (the "None" choice).
	let body = '\t// TODO: implement';
	if (pageClassName) {
		const pageImportLine = `import { ${pageClassName} } from '../pages/${pageBaseName}';`;
		if (!content.includes(pageImportLine)) {
			const lastImportIdx = content.lastIndexOf('\nimport ');
			const insertAt = content.indexOf('\n', lastImportIdx + 1) + 1;
			content = content.slice(0, insertAt) + pageImportLine + '\n' + content.slice(insertAt);
		}
		body = `\tawait new ${pageClassName}(this.page).${methodName}();`;
	}

	const stepBlock = `\n${stepType}('${stepText}', async function (this: PlumWorld) {\n${body}\n});\n`;
	content = content.trimEnd() + '\n' + stepBlock;
	fs.writeFileSync(filePath, content, 'utf8');
}

// A step's body uses `this.page`, so the file needs the World's type. Appending
// to a file that predates it would otherwise not typecheck.
function ensureWorldImport(content) {
	const line = "import { PlumWorld } from '../utils/world';";
	if (content.includes(line)) return content;
	const lastImportIdx = content.lastIndexOf('\nimport ');
	if (lastImportIdx === -1) return `${line}\n${content}`;
	const insertAt = content.indexOf('\n', lastImportIdx + 1) + 1;
	return content.slice(0, insertAt) + line + '\n' + content.slice(insertAt);
}

function ensureCucumberImport(content, stepType) {
	const match = content.match(/import\s*\{([^}]+)\}\s*from\s*'@cucumber\/cucumber';/);
	if (!match) return content;
	const existing = match[1].split(',').map((s) => s.trim());
	if (existing.includes(stepType)) return content;
	return content.replace(
		match[0],
		`import { ${[...existing, stepType].join(', ')} } from '@cucumber/cucumber';`
	);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	clack.intro(pc.bgMagenta(pc.white('  🟣 Plum, Create Step  ')));

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
			...existingPages.map((f) => ({ value: f, label: f })),
			{ value: '__none__', label: 'None — inline the step' }
		]
	});
	if (clack.isCancel(pageChoice)) {
		clack.cancel('Cancelled.');
		process.exit(0);
	}

	let pageFileName = null;
	if (pageChoice === '__new__') {
		const newPageName = await clack.text({
			message: 'Page name',
			placeholder: 'home',
			hint: '"Page.ts" will be appended: e.g. "home" → HomePage.ts',
			validate: (v) => (!v.trim() ? 'Page name is required' : undefined)
		});
		if (clack.isCancel(newPageName)) {
			clack.cancel('Cancelled.');
			process.exit(0);
		}
		pageFileName = toPageFileName(newPageName);
	} else if (pageChoice !== '__none__') {
		pageFileName = pageChoice;
	}

	const pageClassName = pageFileName ? pageFileName.replace('.ts', '') : null;
	const pageBaseName = pageClassName;
	const methodName = toMethodName(stepText);

	const s = clack.spinner();
	s.start('Generating files...');

	// Handle page file (skipped entirely for the "None" choice)
	if (pageFileName) {
		const pageFilePath = path.join(pagesPath, pageFileName);
		fs.mkdirSync(pagesPath, { recursive: true });
		if (!fs.existsSync(pageFilePath)) {
			fs.writeFileSync(pageFilePath, generatePageFile(pageClassName, methodName), 'utf8');
			s.stop(pc.green(`✓ Created ${pageFileName}`));
		} else {
			appendMethodToPage(pageFilePath, methodName);
			s.stop(pc.cyan(`↳ Added ${methodName}() to ${pageFileName}`));
		}
	} else {
		s.stop(pc.green('✓ Ready'));
	}

	// Handle step definition file
	const stepFilePath = path.join(stepDefsPath, stepFileName);
	fs.mkdirSync(stepDefsPath, { recursive: true });
	if (!fs.existsSync(stepFilePath)) {
		fs.writeFileSync(
			stepFilePath,
			pageFileName
				? generateStepFile(stepType, stepText, methodName, pageClassName, pageBaseName)
				: generateStepFileInline(stepType, stepText),
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
			pageFileName
				? `${pc.dim('Page:')}  ${pc.white(`${pageClassName}.${methodName}()`)}`
				: `${pc.dim('Page:')}  ${pc.dim('none — inline body')}`,
			`${pc.dim('Files:')} ${pc.white(stepFileName)}${pageFileName ? ` ${pc.dim('+')} ${pc.white(pageFileName)}` : ''}`
		].join('\n'),
		'Summary'
	);

	clack.outro(
		pc.magenta(
			pageFileName ? 'Done! Remember to implement the page method.' : 'Done! Fill in the step body.'
		)
	);
}

main().catch((err) => {
	clack.log.error(err.message);
	process.exit(1);
});
