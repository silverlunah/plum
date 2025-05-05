![alt-text="social-preview"](https://repository-images.githubusercontent.com/936477779/e928fce3-6d4c-4609-92a0-0a1091c99752)

## Welcome to Plum!

Plum makes setting up your testing framework easy. In just a few seconds, you can run the scaffold tests and write your own tests!

By combining [Playwright](https://playwright.dev) and [Cucumber](https://cucumber.io), tests are easy to write and read. The code follows a POM (Page Object Model) structure, making it scalable and easy for developers to understand, while Cucumber test cases are written in [Gherkin](https://cucumber.io/docs/gherkin/) format, making them accessible to non-developers as well.

You can view, run, schedule tests in a simple UI and even view the history of your runs in the Report page!

**_Pre-requisite:_**
1. Install Docker and ensure the Docker daemon is running.

## For Users
For normal users. People that want to use Plum as a test environment for their website.

**_I. How to Run:_**
1. ```npm install -g plum-e2e```
2. Create your project directory. Example: ```mkdir my-test-folder```
3. Go inside the folder you created ```cd my-test-folder```
4. Run ```plum init```
     1. This will initialize Plum and will create your base files:
        1. ```\tests``` folder: This include sample test cases for [SauceLabs](https://www.saucedemo.com/v1/)
        2. ```.env``` file: Your starting .env file. You can set the BASE_URL to your own site after you're done with the scaffold tests.
5. There are two ways to start testing:
   1. By running the server. Run:<br/> ```plum start to start the server```
   2. Without running the server. Recommended while you're writing your tests. Run:<br/> ```plum dev <@test-id>```. If no test ID is included, it will run all tests
  
## Basic Structure
After you run ```plum init```, these files will be created inside your project directory.

<pre>
╠═ tests
║  ╠═ features         : Cucumber feature files, contains your test cases
║  ╠═ step_definitions : Reference to steps in the feature files
║  ╠═ pages            : Contains functions used in step_definitions
║  ╚═ utils            : Utility files (Constants, utility codes, etc.)
╚═ env.                : Your .env file
</pre>

## Test Structure
Before you remove the scaffold tests, let's learn from those files first. This is the basic way of writing Cucumber tests.
<br/>**Note: Naming convention depends on your preference**

1. Open one of the scaffold feature files.
   1. Feature is the name of the suite. Only one Feature should be in a single feature file.
   2. Scenario is the name of the test case. There can be multiple Scenarios in a single feature file.
   3. The ```@test-some-suite``` and ```@test-some-number``` are tags. We use those tags to call the test we want to run. It should always be placed on top of Feature or Scenario. You can use multiple tags in a single Feature or Scenario. This is useful for tagging, for example, ```@smoke`` tests, every feature or scenario that has @smoke test will run.
   4. Make sure to group your tests for a page in a single Feature file. For example Login tests should be inside a ```LoginPage.feature``` file, while registrations tests in the ```RegistrationPage.feature``` file.
2. Now let's check the step_definition. Step Definitions contains the reference for the steps in the feature files.
   1. In your ```LoginPage.feature``` file, remember the ```Given``` step of ```@test-1```.
   2. Open ```/step_definitions/LoginSteps.js```. Find the Given step from the feature file. In this function, you can see the function ```await this.loginPage.goToLoginPage();``` it triggers from ```pages/loginPage.js```. Codes should be minimal in this page so its easy to understand, keep the messy code in the page files. There are also no file restrictions on where you should place the step definitions, so this Given step can be in any file, lets say ```TestSteps.js```, as long as its inside the ```/step_definitions``` directory any feature file can read it.
   3. These steps are re-usable so make sure to not duplicate steps!
3. Now let's check the page file. This is where functions used in the step_definition is stored. This is where the complicated stuff are stored.
   1. Go back to the ```/step_definitions/LoginSteps.js``` remember the function you saw earlier? ```await this.loginPage.goToLoginPage();``` remember that.
   2. Go to ```/pages/LoginPage.js``` find the ```goToLoginPage()``` function. You can see the lines of code that it used to perform the action to go to the login page. This is where you will most likely code most of the time then call these functions in Step Definitions.
   3. These functions are of course, highly re-usable just need to reference it in your ```utils.hooks.js``` ```CustomWorld``` so it can be carried into all of your Step Definitions.
4. Utilities
   1. In ```/utils```, there are three starting files namely ```constants.js```, ```hooks.js```, and ```utils.js```. You can make/delete utility files except for the ```hooks.js```. Make sure not to delete that file as it contains configurations for your Cucumber Playwright setup.
   2. ```hooks.js```: This is an important file, so make sure to only use this to add and initialize your page files.
     1.  Find the class ```CustomWorld``` in this file.
     2.  Inside you will see the ```this.loginPage``` constructor. It gets initiated in the ```Before``` hook ```this.loginPage = new LoginPage(this.page);```.
     3.  When making your own page file, you always have to include it here to make sure it can be used on your Step Definitions.

## For Developers/Contributors
For people that want to contribute to the project

1. Clone the project ```git clone https://github.com/silverlunah/plum.git```
2. ```cd plum```
3. Initialize the project by:<br/>```npm run init```
4. Check if its running:<br/> ```docker compose up --build -d```
