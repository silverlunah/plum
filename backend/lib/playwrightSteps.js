/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// The steps a spec file declares, read from its source. Playwright reports no
// steps until a test runs (they are runtime calls, not metadata), so the
// repository page would otherwise show step lists for Cucumber and nothing for
// Playwright. A .feature file is parsed for the same reason: this is the
// equivalent for a .spec.ts.
//
// Keyed by the line of the `test()` call, which is what Playwright's own --list
// reports for each spec. Tests generated in a loop all share that line, so they
// share one declared list, exactly as the rows of a Scenario Outline do.

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

function declaredStepsByLine(sourceText, fileName) {
	const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
	const byLine = new Map();

	const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
	const callee = (node) => (ts.isCallExpression(node) ? node.expression.getText(sf) : '');
	const callback = (node) =>
		[...node.arguments].reverse().find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));

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

	const walk = (node, inherited) => {
		ts.forEachChild(node, (child) => {
			if (ts.isCallExpression(child)) {
				const name = callee(child);
				const fn = callback(child);
				if (DESCRIBE_CALL.test(name) && fn) {
					walk(fn, [...inherited, ...hooksIn(fn)]);
					return;
				}
				if (TEST_CALL.test(name) && fn) {
					byLine.set(lineOf(child), [...inherited, ...stepsIn(fn)]);
					return;
				}
			}
			walk(child, inherited);
		});
	};

	walk(sf, []);
	return byLine;
}

/**
 * declaredStepsByLine for a file on disk, or an empty map when it cannot be read
 * or parsed. A spec that does not parse is already reported as having no tests by
 * discovery; it must not take the whole listing down with it.
 */
function declaredStepsForFile(absPath) {
	try {
		return declaredStepsByLine(fs.readFileSync(absPath, 'utf8'), absPath);
	} catch {
		return new Map();
	}
}

module.exports = { declaredStepsByLine, declaredStepsForFile };
