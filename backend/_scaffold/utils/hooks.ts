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

import { Before, After, AfterStep, ITestCaseHookParameter } from '@cucumber/cucumber';
import { setup, teardown, screenshotStep, streamLiveScreenshot } from './browser';
import dotenv from 'dotenv';

dotenv.config();

Before(async ({ pickle }: ITestCaseHookParameter) => {
	const tags = pickle.tags.map((t) => t.name).join(' ');
	console.log(`\n▶ ${pickle.name}${tags ? `  ${tags}` : ''}`);
	await setup();
});

AfterStep(async function ({ pickleStep, result }: { pickleStep: any; result: any }) {
	if (result?.status === 'SKIPPED') return;
	await screenshotStep(this.attach.bind(this));
	await streamLiveScreenshot(pickleStep?.text ?? '');
});

After(async function (scenario: ITestCaseHookParameter) {
	await teardown(this.attach.bind(this), scenario.result?.status === 'FAILED');
});
