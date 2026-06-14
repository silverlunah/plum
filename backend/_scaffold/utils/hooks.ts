import { Before, After, ITestCaseHookParameter } from '@cucumber/cucumber';
import { setup, teardown } from './browser';
import dotenv from 'dotenv';

dotenv.config();

Before(async ({ pickle }: ITestCaseHookParameter) => {
	const tags = pickle.tags.map((t) => t.name).join(' ');
	console.log(`\n▶ ${pickle.name}${tags ? `  ${tags}` : ''}`);
	await setup();
});

After(async function (scenario: ITestCaseHookParameter) {
	await teardown(this.attach.bind(this), scenario.result?.status === 'FAILED');
});
