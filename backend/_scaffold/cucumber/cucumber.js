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
		// Left at 0 deliberately. Plum owns the retry count (Settings -> project ->
		// max retries) and re-runs failures itself, because Cucumber's legacy JSON
		// formatter reports only the final attempt — a native `retry` here would
		// retry a second time on top of Plum's and lose the flaky/attempt counts.
		// Set it for your own local runs if you want; Plum runs are unaffected.
		retry: 0,
		parallel: 0
	}
};
