import { Then } from '@cucumber/cucumber';
import { HomepagePage } from '../pages/HomepagePage';
import { PlumWorld } from '../utils/world';

Then('I should be navigated to the products page', async function (this: PlumWorld) {
	await new HomepagePage(this.page).iShouldBeNavigatedToTheProductsPage();
});
