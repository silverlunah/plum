import { test } from '../fixtures/pages';
import { STANDARD_USER, LOCKED_OUT_USER, INVALID_USER, VALID_PASSWORD } from '../utils/constants';

// Plum selects tests by tag, so give every test its own. A tag on describe
// applies to all of them.
test.describe('Demo Sauce Login', { tag: '@TS-001' }, () => {
	test.beforeEach(async ({ login }) => {
		await test.step('I am in Demo Sauce Login page', () => login.goToLoginPage());
	});

	test(
		'User can log in with valid credentials',
		{ tag: '@TC-001' },
		async ({ login, homepage }) => {
			await test.step(`I enter "${STANDARD_USER}" in username field`, () =>
				login.iEnterUsername(STANDARD_USER));
			await test.step('I enter my password', () => login.iEnterPassword(VALID_PASSWORD));
			await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
			await test.step('I should be navigated to the products page', () =>
				homepage.iShouldBeNavigatedToTheProductsPage());
		}
	);

	test('User cannot log in with invalid credentials', { tag: '@TC-002' }, async ({ login }) => {
		await test.step(`I enter "${INVALID_USER}" in username field`, () =>
			login.iEnterUsername(INVALID_USER));
		await test.step('I enter a wrong password', () => login.iEnterPassword('invalid_password'));
		await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
		await test.step('the login should fail', () => login.verifyLoginFailed());
	});

	// One test per row, each with its own tag so results stay distinguishable.
	const credentials = [
		{ tag: '@TC-003', username: STANDARD_USER, password: VALID_PASSWORD, outcome: 'success' },
		{ tag: '@TC-004', username: LOCKED_OUT_USER, password: VALID_PASSWORD, outcome: 'failure' },
		{ tag: '@TC-005', username: INVALID_USER, password: 'wrong_pass', outcome: 'failure' }
	];

	for (const { tag, username, password, outcome } of credentials) {
		test(
			`User login attempts with different credentials: ${username} expects ${outcome}`,
			{ tag },
			async ({ login }) => {
				await test.step(`I enter "${username}" in username field`, () =>
					login.iEnterUsername(username));
				await test.step('I enter my password', () => login.iEnterPassword(password));
				await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
				await test.step(`the login outcome should be "${outcome}"`, () =>
					login.verifyLoginOutcome(outcome));
			}
		);
	}

	test('User can log in using a data table', { tag: '@TC-006' }, async ({ login, homepage }) => {
		const fields = [
			{ field: 'username', value: STANDARD_USER },
			{ field: 'password', value: VALID_PASSWORD }
		];

		await test.step('I fill in the login form', () => login.fillLoginForm(fields));
		await test.step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage());
	});
});
