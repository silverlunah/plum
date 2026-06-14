import { Given, When } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';

Given('I am in Demo Sauce Login page', async () => {
	await LoginPage.goToLoginPage();
});

Given('I fail this test', async () => {
	throw new Error('err');
});

When('I enter {string} in username field', async (username: string) => {
	await LoginPage.iEnterUsername(username);
});

When('I enter {string} in password field', async (password: string) => {
	await LoginPage.iEnterPassword(password);
});

When('I click on the login button', async () => {
	await LoginPage.iClickOnTheLoginButton();
});
