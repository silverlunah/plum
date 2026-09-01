import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

// Tags are how Plum selects tests: it runs `--grep` with the tags you pick in
// the UI. A tag on describe applies to every test inside it.
test.describe('Demo Sauce Login', { tag: '@TS-001' }, () => {
	test('signs in with valid credentials', { tag: '@TC-001' }, async ({ page }) => {
		const login = new LoginPage(page);
		await login.goto();
		await login.login('standard_user', 'secret_sauce');
		await login.expectSignedIn();
	});

	test('rejects invalid credentials', { tag: '@TC-002' }, async ({ page }) => {
		const login = new LoginPage(page);
		await login.goto();
		await login.login('invalid_user', 'wrong_password');
		await login.expectRejected();
	});

	// test.step() is optional, but Plum shows each step as its own row in the
	// report — without them a test is reported as a single pass or fail.
	test('locked-out user cannot sign in', { tag: '@TC-003' }, async ({ page }) => {
		const login = new LoginPage(page);
		await test.step('open the login page', () => login.goto());
		await test.step('submit locked-out credentials', () =>
			login.login('locked_out_user', 'secret_sauce'));
		await test.step('an error is shown', () => login.expectRejected());
	});
});
