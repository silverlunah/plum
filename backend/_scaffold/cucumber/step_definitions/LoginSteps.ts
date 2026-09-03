import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';
import { PlumWorld } from '../utils/world';

// `function` rather than an arrow, so `this` is the scenario's World and
// `this.page` is its own page. An arrow function would not have one.
Given('I am in Demo Sauce Login page', async function (this: PlumWorld) {
	await new LoginPage(this.page).goToLoginPage();
});

When('I enter {string} in username field', async function (this: PlumWorld, username: string) {
	await new LoginPage(this.page).iEnterUsername(username);
});

When('I enter {string} in password field', async function (this: PlumWorld, password: string) {
	await new LoginPage(this.page).iEnterPassword(password);
});

When('I click on the login button', async function (this: PlumWorld) {
	await new LoginPage(this.page).iClickOnTheLoginButton();
});

When('I fill in the login form:', async function (this: PlumWorld, dataTable: DataTable) {
	const fields = dataTable.hashes() as { field: string; value: string }[];
	await new LoginPage(this.page).fillLoginForm(fields);
});

Then('the login outcome should be {string}', async function (this: PlumWorld, outcome: string) {
	await new LoginPage(this.page).verifyLoginOutcome(outcome);
});

Then('the login should fail', async function (this: PlumWorld) {
	await new LoginPage(this.page).verifyLoginFailed();
});
