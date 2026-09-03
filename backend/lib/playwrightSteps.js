/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// What a spec file declares, read from its source: each test's steps, and each
// describe's tag.
//
// Both are things Playwright's --list cannot tell us. Steps are runtime calls
// rather than metadata, so it reports none. And it flattens a describe's tag onto
// every spec beneath it, so a spec's `tags` do not say which of them came from the
// describe. A .feature file is parsed for its steps and its Feature tag; this is
// the equivalent for a .spec.ts.
//
// Keyed by line, which is what --list reports for each spec and each suite. Tests
// generated in a loop all share their `test()` line, so they share one declared
// step list, exactly as the rows of a Scenario Outline do.

const fs = require('fs');
const ts = require('typescript');

// `test`, and the modifiers that still declare one.
const TEST_CALL = /^(test|it)(\.(only|fixme|fail|slow))?$/;
const DESCRIBE_CALL = /^(test|describe)?\.?describe$/;

/**
 * A step's name as authored. Anything interpolated or computed becomes
 * `<expression>`, which is how Gherkin writes an Outline placeholder, so a
 * parameterised Playwright test reads the same way a parameterised scenario does.
 */
function stepName(node, sf) {
	if (!node) return null;
	if (ts.isStringLiteralLike(node)) return node.text;
	if (ts.isTemplateExpression(node)) {
		let out = node.head.text;
		for (const span of node.templateSpans) {
			out += `<${span.expression.getText(sf)}>${span.literal.text}`;
		}
		return out;
	}
	// Any other expression: show its source, so the list keeps the right length.
	// Dropping the step instead made the list quietly incomplete, which reads as
	// a test with fewer steps than it has.
	const source = node.getText(sf).replace(/\s+/g, ' ').trim();
	return source ? `<${source.length > 40 ? `${source.slice(0, 39)}…` : source}>` : null;
}

function declaredByLine(sourceText, fileName) {
	const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
	const tests = new Map();
	const suites = new Map();

	const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	const callee = (node) => (ts.isCallExpression(node) ? node.expression.getText(sf) : '');
	const callback = (node) =>
		[...node.arguments].reverse().find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));

	// The `tag` of a `{ tag: '@X' }` / `{ tag: ['@X', '@Y'] }` options argument.
	// A shorthand `{ tag }` (a loop passing a variable) is not readable here and
	// yields nothing, which leaves the caller on its own inference.
	const tagsOf = (node) => {
		const opts = node.arguments.find((a) => ts.isObjectLiteralExpression(a));
		const prop = opts?.properties.find(
			(pr) => ts.isPropertyAssignment(pr) && pr.name.getText(sf) === 'tag'
		);
		const value = prop?.initializer;
		if (!value) return [];
		if (ts.isStringLiteralLike(value)) return [value.text];
		if (ts.isArrayLiteralExpression(value)) {
			return value.elements.filter((e) => ts.isStringLiteralLike(e)).map((e) => e.text);
		}
		return [];
	};

	// Top-level step names in a callback. A step nested inside another is skipped,
	// matching what a run reports.
	const stepsIn = (fn) => {
		const found = [];
		if (!fn) return found;
		const visit = (node) => {
			if (ts.isCallExpression(node) && /(^|\.)step$/.test(callee(node))) {
				const name = stepName(node.arguments[0], sf);
				if (name !== null) found.push(name);
				return;
			}
			ts.forEachChild(node, visit);
		};
		ts.forEachChild(fn, visit);
		return found;
	};

	// beforeEach steps run for every test in that describe, so they are prepended
	// the way a Background's steps are.
	const hooksIn = (body) => {
		const found = [];
		const visit = (node) => {
			if (ts.isCallExpression(node)) {
				const name = callee(node);
				if (/(^|\.)beforeEach$/.test(name)) {
					found.push(...stepsIn(callback(node)));
					return;
				}
				// Not into a nested describe or test: those own their steps.
				if (DESCRIBE_CALL.test(name) || TEST_CALL.test(name)) return;
			}
			ts.forEachChild(node, visit);
		};
		ts.forEachChild(body, visit);
		return found;
	};

	const walk = (node, inheritedSteps, inheritedTags) => {
		ts.forEachChild(node, (child) => {
			if (ts.isCallExpression(child)) {
				const name = callee(child);
				const fn = callback(child);
				if (DESCRIBE_CALL.test(name) && fn) {
					const own = tagsOf(child);
					suites.set(lineOf(child), own);
					walk(fn, [...inheritedSteps, ...hooksIn(fn)], [...inheritedTags, ...own]);
					return;
				}
				if (TEST_CALL.test(name) && fn) {
					tests.set(lineOf(child), {
						steps: [...inheritedSteps, ...stepsIn(fn)],
						// Every tag this test inherits from the describes around it, so the
						// caller can tell those apart from the ones the test declares itself.
						inheritedTags
					});
					return;
				}
			}
			walk(child, inheritedSteps, inheritedTags);
		});
	};

	walk(sf, [], []);
	return { tests, suites };
}

/**
 * declaredByLine for a file on disk, or empty maps when it cannot be read or
 * parsed. A spec that does not parse is already reported as having no tests by
 * discovery; it must not take the whole listing down with it.
 */
function declaredForFile(absPath) {
	try {
		return declaredByLine(fs.readFileSync(absPath, 'utf8'), absPath);
	} catch {
		return { tests: new Map(), suites: new Map() };
	}
}

module.exports = { declaredByLine, declaredForFile };
