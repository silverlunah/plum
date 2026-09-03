// Yours to change. Plum supplies the test selection and the report format on the
// command line, so `npx cucumber-js` from this folder behaves the same way a Plum
// run does and nothing here is Plum's to keep.
module.exports = {
	default: {
		requireModule: ['ts-node/register'],
		require: ['utils/world.ts', 'utils/hooks.ts', 'step_definitions/**/*.ts'],
		paths: ['features/**/*.feature'],
		format: ['progress'],
		// Leave at 0. Cucumber reports only the final attempt of a retry, so Plum
		// re-runs failed scenarios itself, using the project's max-retries setting;
		// a retry here would run underneath that and hide the earlier attempts.
		retry: 0,
		parallel: 0
	}
};
