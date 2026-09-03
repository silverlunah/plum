import { Then } from '@cucumber/cucumber';
import { HomepagePage } from '../pages/HomepagePage';

Then('I should be navigated to the products page', async () => {
	await HomepagePage.iShouldBeNavigatedToTheProductsPage();
});
