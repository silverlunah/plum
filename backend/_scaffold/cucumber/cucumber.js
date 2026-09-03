const reportFile = process.env.PLUM_REPORT_FILE;

// Yours to change. Plum only chooses which tests to run, so `npx cucumber-js` from
// this folder behaves the same way a Plum run does.
module.exports = {
	default: {
		requireModule: ['ts-node/register'],
		require: ['step_definitions/**/*.ts', 'utils/hooks.ts'],
		paths: ['features/**/*.feature'],
		// Keep the json entry: it is how a run reaches the Plum UI.
		format: ['progress', ...(reportFile ? [`json:${reportFile}`] : [])],
		// Leave at 0. Plum re-runs failures itself using the project's max-retries
		// setting, and a retry here would run on top of that.
		retry: 0,
		parallel: 0
	}
};
