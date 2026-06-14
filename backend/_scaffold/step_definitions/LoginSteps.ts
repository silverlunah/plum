import { Given } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';

Given('I am in Demo Sauce Login page', async () => {
	await LoginPage.goToLoginPage();
});

Given('I fail this test', async () => {
	throw new Error('err');
});
