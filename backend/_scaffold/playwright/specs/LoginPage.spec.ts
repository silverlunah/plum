import { test } from '../fixtures/plum';
import { LoginPage } from '../pages/LoginPage';
import { HomepagePage } from '../pages/HomepagePage';
import { WELCOME_MESSAGE } from '../utils/constants';

// Plum selects tests by tag, so give every test its own. A tag on describe
// applies to all of them.
test.describe('Demo Sauce Login', { tag: '@TS-001' }, () => {
	// Lets these tests spread across workers. Playwright otherwise runs a whole
	// file in one worker, so the worker count would have no effect here.
	test.describe.configure({ mode: 'parallel' });

	let login: LoginPage;
	let homepage: HomepagePage;

	test.beforeEach(async ({ page, step }) => {
		console.log(WELCOME_MESSAGE);
		login = new LoginPage(page);
		homepage = new HomepagePage(page);
		await step('I am in Demo Sauce Login page', () => login.goToLoginPage());
	});

	test('User can log in with valid credentials', { tag: '@TC-001' }, async ({ step }) => {
		await step('I enter "standard_user" in username field', () =>
			login.iEnterUsername('standard_user')
		);
		await step('I enter "secret_sauce" in password field', () =>
			login.iEnterPassword('secret_sauce')
		);
		await step('I click on the login button', () => login.iClickOnTheLoginButton());
		await step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage()
		);
	});

	test('User cannot log in with invalid credentials', { tag: '@TC-002' }, async ({ step }) => {
		await step('I enter "invalid_user" in username field', () =>
			login.iEnterUsername('invalid_user')
		);
		await step('I enter "invalid_password" in password field', () =>
			login.iEnterPassword('invalid_password')
		);
		await step('I click on the login button', () => login.iClickOnTheLoginButton());
		await step('the login should fail', () => login.verifyLoginFailed());
	});

	// One test per row, each with its own tag so results stay distinguishable.
	const credentials = [
		{ tag: '@TC-003', username: 'standard_user', password: 'secret_sauce', outcome: 'success' },
		{ tag: '@TC-004', username: 'locked_out_user', password: 'secret_sauce', outcome: 'failure' },
		{ tag: '@TC-005', username: 'invalid_user', password: 'wrong_pass', outcome: 'failure' }
	];

	for (const { tag, username, password, outcome } of credentials) {
		test(
			`User login attempts with different credentials: ${username} expects ${outcome}`,
			{ tag },
			async ({ step }) => {
				await step(`I enter "${username}" in username field`, () => login.iEnterUsername(username));
				await step(`I enter "${password}" in password field`, () => login.iEnterPassword(password));
				await step('I click on the login button', () => login.iClickOnTheLoginButton());
				await step(`the login outcome should be "${outcome}"`, () =>
					login.verifyLoginOutcome(outcome)
				);
			}
		);
	}

	test('User can log in using a data table', { tag: '@TC-006' }, async ({ step }) => {
		const fields = [
			{ field: 'username', value: 'standard_user' },
			{ field: 'password', value: 'secret_sauce' }
		];

		await step('I fill in the login form', () => login.fillLoginForm(fields));
		await step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage()
		);
	});
});
