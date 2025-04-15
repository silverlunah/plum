![alt-text="social-preview"](https://repository-images.githubusercontent.com/936477779/e928fce3-6d4c-4609-92a0-0a1091c99752)

**_Pre-requisite:_**

1. After pulling the project, run `npm run init`. This will run npm install throughout the monorepo and generate .env file (if you don't have one). Technically, you can skip this and run the docker command immediately, but you'll have to run this when you start coding/debugging test scripts anyway.

**_I. How to Run:_**

1. Run `docker-compose up --build` or `docker compose up` if you don't have docker-compose installed

2. After build is done, go to: `http://localhost:5173/` (this will also appear in console)

3. Enter the testcase ID in the textbox without or click the test id from the test list in the right panel

4. Click Run button

5. View Report button will appear after the run is over

**_II. To run without using UI (FOR DEBUGGING):_**
This will automatically run headful.

1. Go to backend folder `cd backend`

2. Run `npm install`

3. Run `TAG="@test-1" npm run test`<br/>
   We will not run it as `npx playwright test` because we installed `cucumber-js`. In the package.json, you will find "scripts" where there's one child called "test" which contains the cucumber command, we can call "test" using "npm run" and the command can also catch a TAG.

**_III. Running Headful_**

Headful will not work when running using UI, we don't need to run headful in production anyway. This is a best practice to reduce cost and time.<br />

But during development and debugging, you can go to `backend/tests/utils/hooks.js`, then change `this.browser = await chromium.launch({ headless: true });` to `{ headless: false }`<br />
This is while running using CLI (see II.).<br />

**_IV. Writing Tests_**<br/>
This will be in perspective of writing a fresh feature file. Cucumber with [Page Object Model (POM)](https://www.selenium.dev/documentation/test_practices/encouraged/page_object_models/) mainly works with 3 files: `feature`, `step definitions`, and `step files`. There should be a working test included in this project so you can reference it while you try to link feature, step definition, and page files.

1. To write tests, begin by creating a `Feature file` in the `test/features` folder. The file should be responsible for the page/feature being tested. For example, if you're making a test case for login, you should put it in a `Login.feature` file (if the team decides to name by feature) or `LoginPage.feature` (if the team decides to name by page). Tests are written in Gherkin format. You can check the existing `.feature` files for the format. Learn more: [https://cucumber.io/docs/gherkin/](https://cucumber.io/docs/gherkin/).

2. Create a `Step Definition` in the `test/step_definitions` folder. This file will catch the steps written in `.feature` files using regex. The filename should be `"page/feature + Step.js"`, so for login, it should be `LoginPage.js`. Since we are using POM, this file should be a collection of functions needed to operate the test step, so keep the technical stuff as minimal as possible in this page. The functions will be placed in the Page files.

3. Create a `Page` file. The filename should be `"page/feature + Page.js"`. This should have the functions from `Step Definition`. The actual codes to interact with elements and assertions should be written here.

4. To access Page file functions from Step Definitions, go to `/tests/utils/hooks`. Let's assume that we are making a `NewPageSteps`. At the top, require the `NewPage` class from the page file.

   ```javascript
   const NewPage = require('../pages/NewPage');
   ```

5. In the same file, add it to the world class and assign `null`.

   ```javascript
   class CustomWorld {
   	constructor() {
   		this.browser = null;
   		this.context = null;
   		this.page = null;
   		this.loginPage = null;
   		this.utils = null;
   		this.newPage = null; // <-- Something like this
   	}
   }
   ```

6. In the same file, add it to the hooks.

   ```javascript
   Before(async function () {
   	this.browser = await chromium.launch({ headless: true });
   	this.context = await this.browser.newContext();
   	this.page = await this.context.newPage();
   	this.loginPage = new LoginPage(this.page);
   	this.utils = new Utils(this.page);
   	this.newPage = new NewPage(this.page); // <-- Something like this
   });
   ```

7. Now you can use the page class functions to any step definitions

   ```javascript
   const { Given, When, Then } = require('@cucumber/cucumber');

   Given('I log something', async function () {
   	await this.newPage.someFunctionFromNewPage(); // <-- Something like this
   });
   ```
