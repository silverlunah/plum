import { test } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { HomepagePage } from '../pages/HomepagePage';

// Tags are how Plum selects tests: it runs --grep with the tags you pick in the
// UI. A tag on describe applies to every test inside it.
//
// Each action is wrapped in test.step() so it shows up as its own row in the Plum
// report. Without them a test is reported as a single pass or fail.
test.describe('Demo Sauce Login', { tag: '@TS-001' }, () => {
	let login: LoginPage;
	let homepage: HomepagePage;

	test.beforeEach(async ({ page }) => {
		login = new LoginPage(page);
		homepage = new HomepagePage(page);
	});

	// The equivalent of a Background. It is called inside each test rather than in
	// beforeEach because Playwright's JSON report omits hook steps entirely, and
	// Cucumber's own report inlines Background steps into every scenario.
	const openLoginPage = () =>
		test.step('I am in Demo Sauce Login page', () => login.goToLoginPage());

	// ── Basic test ───────────────────────────────────────────────────────────
	test('User can log in with valid credentials', { tag: '@TC-001' }, async () => {
		await openLoginPage();
		await test.step('I enter "standard_user" in username field', () =>
			login.iEnterUsername('standard_user'));
		await test.step('I enter "secret_sauce" in password field', () =>
			login.iEnterPassword('secret_sauce'));
		await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
		await test.step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage());
	});

	test('User cannot log in with invalid credentials', { tag: '@TC-002' }, async () => {
		await openLoginPage();
		await test.step('I enter "invalid_user" in username field', () =>
			login.iEnterUsername('invalid_user'));
		await test.step('I enter "invalid_password" in password field', () =>
			login.iEnterPassword('invalid_password'));
		await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
		await test.step('the login should fail', () => login.verifyLoginFailed());
	});

	// ── Parameterised ────────────────────────────────────────────────────────
	// The equivalent of a Scenario Outline: one test per row. The row's values go
	// in the title so each case is identifiable in the report.
	const credentials = [
		{ username: 'standard_user', password: 'secret_sauce', outcome: 'success' },
		{ username: 'locked_out_user', password: 'secret_sauce', outcome: 'failure' },
		{ username: 'invalid_user', password: 'wrong_pass', outcome: 'failure' }
	];

	for (const { username, password, outcome } of credentials) {
		test(
			`User login attempts with different credentials: ${username} expects ${outcome}`,
			{ tag: '@TC-003' },
			async () => {
				await openLoginPage();
				await test.step(`I enter "${username}" in username field`, () =>
					login.iEnterUsername(username));
				await test.step(`I enter "${password}" in password field`, () =>
					login.iEnterPassword(password));
				await test.step('I click on the login button', () => login.iClickOnTheLoginButton());
				await test.step(`the login outcome should be "${outcome}"`, () =>
					login.verifyLoginOutcome(outcome));
			}
		);
	}

	// ── Structured data ──────────────────────────────────────────────────────
	// The equivalent of a data table: pass rows straight into a page object.
	test('User can log in using a data table', { tag: '@TC-004' }, async () => {
		const fields = [
			{ field: 'username', value: 'standard_user' },
			{ field: 'password', value: 'secret_sauce' }
		];

		await openLoginPage();
		await test.step('I fill in the login form', () => login.fillLoginForm(fields));
		await test.step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage());
	});
});
