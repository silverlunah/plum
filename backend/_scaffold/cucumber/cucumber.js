const reportFile = process.env.PLUM_REPORT_FILE;

// This file belongs to your project, not to Plum. Plum runs the Cucumber CLI and
// passes only which tests to run (--tags) — everything below is yours, and
// `npx cucumber-js` from this folder behaves exactly the same way Plum does.
module.exports = {
	default: {
		requireModule: ['ts-node/register'],
		require: ['step_definitions/**/*.ts', 'utils/hooks.ts'],
		paths: ['features/**/*.feature'],
		// Plum sets PLUM_REPORT_FILE when it starts a run; the JSON written there is
		// what shows up in the Plum UI. Run the command yourself and it is unset, so
		// only the progress formatter runs.
		format: ['progress', ...(reportFile ? [`json:${reportFile}`] : [])],
		// Retries and parallelism are read from here, not from Plum's UI. A scenario
		// that fails then passes on a retry is reported as flaky rather than failed.
		retry: 1,
		parallel: 0
	}
};
