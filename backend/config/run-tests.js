const { execSync } = require('child_process');
const path = require('path');

const tag = process.env.TAG; // Read the TAG environment variable

try {
	// Install Playwright
	execSync('npx playwright install', { stdio: 'inherit' });

	// Run the tests with the tag filter, only if a tag is provided
	const cucumberCommand = tag
		? `cucumber-js tests/features/**/*.feature --format json:reports/cucumber_report.json --tags "${tag}"`
		: `cucumber-js tests/features/**/*.feature --format json:reports/cucumber_report.json`;

	execSync(cucumberCommand, { stdio: 'inherit' });
} catch (error) {
	// Log the error to the console if tests fail
	console.error('Tests failed:', error.message);
} finally {
	// Always run the report generation after tests (even if they fail)
	try {
		execSync('node config/generate-report.js', { stdio: 'inherit' });
	} catch (error) {
		console.error('Error running report generation:', error.message);
	}
}
