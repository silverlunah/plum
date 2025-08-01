![alt-text="social-preview"](https://repository-images.githubusercontent.com/936477779/e928fce3-6d4c-4609-92a0-0a1091c99752)

<p align="center">
  📖 <a href="https://github.com/silverlunah/plum/wiki">Wiki</a> |
  📦 <a href="https://www.npmjs.com/package/plum-e2e">npm</a>
</p>

## Welcome to Plum!

Plum makes setting up your testing framework easy. In just a few seconds, you can run the scaffold tests and write your own tests!

By combining [Playwright](https://playwright.dev) and [Cucumber](https://cucumber.io), tests are easy to write and read. The code follows a POM (Page Object Model) structure, making it scalable and easy for developers to understand, while Cucumber test cases are written in [Gherkin](https://cucumber.io/docs/gherkin/) format, making them accessible to non-developers as well.

You can view, run, and schedule tests in a simple UI. You can even view the history of your runs in the reports page!

**_Pre-requisite:_**

1. Install Docker and ensure the Docker daemon is running.

## For Users

People that want to use Plum as a test environment for their website.

**_I. How to Run:_**

1. `npm install -g plum-e2e`
2. Create your project directory. Example: `mkdir my-test-folder`
3. Go inside the folder you created `cd my-test-folder`
4. Run `plum init`
   1. This will initialize Plum and will create your base files:
      1. `\tests` folder: This include sample test cases for [SauceLabs](https://www.saucedemo.com/v1/)
      2. `.env` file: Your starting .env file. You can set the BASE_URL to your own site after you're done with the scaffold tests.
5. There are two ways to start testing:
   1. By running the server. Run:<br/> `plum start` to start the server
      1. Access the UI at: http://localhost:5173/
   2. Without running the server. Recommended while you're writing your tests. Run:<br/> `plum dev <@test-id>`. If no test ID is included, it will run all tests

## Basic Structure

After you run `plum init`, these files will be created inside your project directory.

<pre>
╠═ tests
║  ╠═ features         : Cucumber feature files, contains your test cases
║  ╠═ step_definitions : Reference to steps in the feature files
║  ╠═ pages            : Contains functions used in step_definitions
║  ╚═ utils            : Utility files (Constants, utility codes, etc.)
╚═ env.                : Your .env file
</pre>

## Tutorial

1. For a complete guide on how to write tests, visit our [Coming Soon](https://github.com/silverlunah/plum/wiki)
2. An easy way to learn is to check the scaffold files starting from the Feature files -> Step Definitions -> Page files and utils/world.ts for the CustomWorld initialization. Those are the main files you need to write a test case.

## For Developers/Contributors

For people that want to contribute to the project

1. Clone the project `git clone https://github.com/silverlunah/plum.git`
2. `cd plum`
3. Initialize the project by:<br/>`npm run init`
4. Check if its running:<br/> `docker compose up --build -d`

## Other

Plum is completely free to use! But if you want to share some love, here's my [PayPal](https://www.paypal.me/silverlunah) or [Wise](https://wise.com/pay/me/janneserjosee)
