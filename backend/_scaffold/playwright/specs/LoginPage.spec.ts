// `test` comes from Plum's fixture, not straight from @playwright/test — that is
// what records the session for report replay. `expect` is re-exported from it.
import { test, type Step } from '../fixtures/plum';
import { LoginPage } from '../pages/LoginPage';
import { HomepagePage } from '../pages/HomepagePage';
import { WELCOME_MESSAGE } from '../utils/constants';

// Tags are how Plum selects tests: it runs --grep with the tags you pick in the
// UI. A tag on describe applies to every test inside it.
//
// Each action is wrapped in test.step() so it shows up as its own row in the Plum
// report. Without them a test is reported as a single pass or fail.
test.describe('Demo Sauce Login', { tag: '@TS-001' }, () => {
	// Playwright splits work across files, not within them: without this a whole
	// file runs in one worker, and Plum's worker setting appears to do nothing on a
	// single-file project. Parallel mode lets these tests spread across workers —
	// each gets its own browser and its own fixtures, so they must not depend on
	// each other or on order.
	test.describe.configure({ mode: 'parallel' });

	let login: LoginPage;
	let homepage: HomepagePage;

	test.beforeEach(async ({ page }) => {
		// Example of using a shared constant. Runs once per test.
		console.log(WELCOME_MESSAGE);
		login = new LoginPage(page);
		homepage = new HomepagePage(page);
	});

	// The equivalent of a Background. It is called inside each test rather than in
	// beforeEach because Playwright's JSON report omits hook steps entirely, and
	// Cucumber's own report inlines Background steps into every scenario.
	// Takes `step` as an argument because it is a per-test fixture and this helper
	// lives at describe scope.
	const openLoginPage = (step: Step) =>
		step('I am in Demo Sauce Login page', () => login.goToLoginPage());

	// ── Basic test ───────────────────────────────────────────────────────────
	test('User can log in with valid credentials', { tag: '@TC-001' }, async ({ step }) => {
		await openLoginPage(step);
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
		await openLoginPage(step);
		await step('I enter "invalid_user" in username field', () =>
			login.iEnterUsername('invalid_user')
		);
		await step('I enter "invalid_password" in password field', () =>
			login.iEnterPassword('invalid_password')
		);
		await step('I click on the login button', () => login.iClickOnTheLoginButton());
		await step('the login should fail', () => login.verifyLoginFailed());
	});

	// ── Parameterised ────────────────────────────────────────────────────────
	// The equivalent of a Scenario Outline: one test per row. Each row carries its
	// own tag rather than sharing one, because these are separate tests here — a
	// shared tag would make the id ambiguous and collapse three results into one.
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
				await openLoginPage(step);
				await step(`I enter "${username}" in username field`, () => login.iEnterUsername(username));
				await step(`I enter "${password}" in password field`, () => login.iEnterPassword(password));
				await step('I click on the login button', () => login.iClickOnTheLoginButton());
				await step(`the login outcome should be "${outcome}"`, () =>
					login.verifyLoginOutcome(outcome)
				);
			}
		);
	}

	// ── Structured data ──────────────────────────────────────────────────────
	// The equivalent of a data table: pass rows straight into a page object.
	test('User can log in using a data table', { tag: '@TC-006' }, async ({ step }) => {
		const fields = [
			{ field: 'username', value: 'standard_user' },
			{ field: 'password', value: 'secret_sauce' }
		];

		await openLoginPage(step);
		await step('I fill in the login form', () => login.fillLoginForm(fields));
		await step('I should be navigated to the products page', () =>
			homepage.iShouldBeNavigatedToTheProductsPage()
		);
	});
});
