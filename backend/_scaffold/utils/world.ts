import { IWorldOptions, setWorldConstructor, World } from '@cucumber/cucumber';
import { Browser, Page, BrowserContext } from 'playwright';
import { LoginPage } from '../pages/LoginPage';
import { Utils } from './utils';

export class CustomWorld extends World {
	browser!: Browser;
	context!: BrowserContext;
	page!: Page;
	loginPage!: LoginPage;
	utils!: Utils;

	constructor(options: IWorldOptions) {
		super(options);
	}
}
