import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { ShowcasePage } from '../pages/ShowcasePage';

// Background
Given('I am on the Sauce Demo login page', async () => {
	await ShowcasePage.goToLoginPage();
});

// Basic scenario + Scenario Outline
When('I log in with username {string} and password {string}', async (username: string, password: string) => {
	await ShowcasePage.loginWith(username, password);
});

// Data table
When('I fill in the login form:', async (dataTable: DataTable) => {
	const fields = dataTable.hashes() as { field: string; value: string }[];
	await ShowcasePage.fillLoginForm(fields);
});

// Doc string
When('I submit the following note:', async (note: string) => {
	await ShowcasePage.receiveNote(note);
});

Then('I should see the products page', async () => {
	await ShowcasePage.verifyProductsPage();
});

Then('the login outcome should be {string}', async (outcome: string) => {
	await ShowcasePage.verifyLoginOutcome(outcome);
});

Then('the note should be received', async () => {
	// Doc strings are just strings — nothing to assert here
});
