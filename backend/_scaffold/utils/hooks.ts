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

// Wires up Plum's session recording — removing or reordering code here can silently break report replay.

import { Before, After, BeforeStep, ITestCaseHookParameter } from '@cucumber/cucumber';
import { setup, teardown, flushRecordings, markStepStart } from './browser';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Pickle steps carry no keyword (Cucumber normalizes Given/When/Then/And/But
 * away during Gherkin → Pickle compilation) — recover it by walking the
 * gherkinDocument for the AST node the pickle step was compiled from.
 */
function resolveStepKeyword(gherkinDocument: any, pickleStep: any): string {
	const astNodeId = pickleStep?.astNodeIds?.[0];
	if (!astNodeId) return '';
	const steps: any[] = [];
	for (const child of gherkinDocument?.feature?.children ?? []) {
		if (child.background) steps.push(...child.background.steps);
		if (child.scenario) steps.push(...child.scenario.steps);
		for (const ruleChild of child.rule?.children ?? []) {
			if (ruleChild.background) steps.push(...ruleChild.background.steps);
			if (ruleChild.scenario) steps.push(...ruleChild.scenario.steps);
		}
	}
	return steps.find((s) => s.id === astNodeId)?.keyword?.trim() ?? '';
}

Before(async ({ pickle }: ITestCaseHookParameter) => {
	const tags = pickle.tags.map((t) => t.name).join(' ');
	console.log(`\n▶ ${pickle.name}${tags ? `  ${tags}` : ''}`);
	await setup();
});

BeforeStep(async function ({
	pickleStep,
	gherkinDocument
}: {
	pickleStep: any;
	gherkinDocument: any;
}) {
	const keyword = resolveStepKeyword(gherkinDocument, pickleStep);
	const text = pickleStep?.text ?? '';
	await markStepStart(keyword ? `${keyword} ${text}` : text);
});

After(async function () {
	await flushRecordings(this.attach.bind(this));
	await teardown();
});

// ---------------------------------------------------------------------------
// Your code below this line. Everything above wires up Plum's session
// recording — leave it as-is. Add your own Before/After/BeforeStep hooks
// here; Cucumber runs every registered hook, so yours run alongside Plum's.
// ---------------------------------------------------------------------------
