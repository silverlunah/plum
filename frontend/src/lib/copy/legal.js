/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Shown on first-run setup, before the admin account is created. Plum is
// self-hosted, MIT-licensed software with no cloud service — this notice states
// that plainly so an operator knows exactly what they are (and are not) agreeing
// to. Keep it factual: every claim here must stay true of the codebase.
export const TERMS_HEADING = 'Before you begin';

export const TERMS_INTRO =
	'Plum is open-source software (MIT licensed) that you install and run on infrastructure you control. By setting up this instance you acknowledge the following.';

export const TERMS_SECTIONS = [
	{
		h: 'Your data stays yours',
		p: 'Everything Plum stores — test cases, runs, reports, session recordings, schedules, user accounts and settings — is written only to the database and disk of the server you run it on. Plum has no cloud service, no account system of its own, and no central servers.'
	},
	{
		h: 'Plum collects nothing',
		p: 'Plum contains no analytics, telemetry, tracking or usage reporting, and it does not phone home. Nothing about how you use this instance, what you test, or who your users are is ever sent to the Plum project, its maintainers, or any third party.'
	},
	{
		h: 'Outbound connections are only the ones you configure',
		p: 'The one exception is an anonymous version check against the public npm registry, used to show an “update available” notice; it sends no information about you or your data. Everything else that leaves your server — Discord or Slack notifications, S3 backups, runner-node traffic, CI trigger callbacks — goes only to endpoints you set up, and carries only what you chose to send there.'
	},
	{
		h: 'You are the operator',
		p: 'You are responsible for securing this server and its network exposure, for protecting its credentials (the JWT secret, database, S3 keys, MCP keys and runner tokens), and for complying with any laws or policies that apply to the applications you test and the people whose accounts you create here.'
	},
	{
		h: 'No warranty',
		p: 'Plum is provided “as is”, without warranty of any kind, as set out in the MIT License. The maintainers are not liable for any loss or damage arising from its use.'
	}
];

export const TERMS_AGREE_LABEL = 'I have read and understand the above.';
export const TERMS_REQUIRED_ERROR = 'Please confirm you have read the notice above.';
