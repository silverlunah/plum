/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Opens a browser per scenario and records it for report replay: removing or
// reordering code here can silently break replay.

import {
	Before,
	After,
	BeforeStep,
	setDefaultTimeout,
	ITestCaseHookParameter
} from '@cucumber/cucumber';
import { openRecordedBrowser } from './recorder';
import type { PlumWorld } from './world';
import dotenv from 'dotenv';

dotenv.config();

// Cucumber's default is 5 seconds, which a cold browser launch or a slow page can
// exceed. Raise it here if your app needs longer.
setDefaultTimeout(30_000);

/**
 * Pickle steps carry no keyword (Cucumber normalizes Given/When/Then/And/But
 * away during Gherkin → Pickle compilation): recover it by walking the
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

Before(async function (this: PlumWorld, { pickle }: ITestCaseHookParameter) {
	const tags = pickle.tags.map((t) => t.name).join(' ');
	console.log(`\n▶ ${pickle.name}${tags ? `  ${tags}` : ''}`);
	// Assigned onto the World rather than constructed by it, so this works
	// whether the World is Plum's or one an adopted repo already had.
	Object.assign(this, await openRecordedBrowser());
});

BeforeStep(async function (
	this: PlumWorld,
	{ pickleStep, gherkinDocument }: { pickleStep: any; gherkinDocument: any }
) {
	const keyword = resolveStepKeyword(gherkinDocument, pickleStep);
	const text = pickleStep?.text ?? '';
	await this.recorder.markStep(this.page, keyword ? `${keyword} ${text}` : text);
});

After(async function (this: PlumWorld) {
	await this.recorder.flush(this.attach.bind(this));
	await this.browser?.close();
});

// ---------------------------------------------------------------------------
// Your code below this line. Everything above opens the browser and wires up
// Plum's session recording: leave it as-is. Add your own Before/After/BeforeStep
// hooks here; Cucumber runs every registered hook, so yours run alongside these,
// and `this` is the same World, so `this.page` is available in them too.
// ---------------------------------------------------------------------------
