/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export const BUILTIN_RUNNER_LABEL = 'Built-in';
export const ALL_TESTS_LABEL = 'all tests';
export const AUTOMATED_LABEL = 'Automated';

export const CONFIRM_TITLE = 'Confirm';
export const CONFIRM_LABEL = 'Delete';
export const CANCEL_LABEL = 'Cancel';
export const WORKING_LABEL = 'Working…';

export const EMPTY_STATE_MESSAGE = 'Nothing here yet.';

export const SAVE_LABEL = 'Save';
export const EDIT_LABEL = 'Edit';
export const CLOSE_LABEL = 'Close';
export const DELETE_LABEL = 'Delete';
export const CLEAR_LABEL = 'Clear';

export const DISCORD_LABEL = 'Discord';
export const SLACK_LABEL = 'Slack';

export const EMAIL_LABEL = 'Email';
export const PASSWORD_LABEL = 'Password';

export const CLEAR_SEARCH_LABEL = 'Clear search';
export const SORT_BY_LABEL = 'Sort by';
export const LOADING_LABEL = 'Loading…';
export const SAVING_LABEL = 'Saving…';
export const CREATING_LABEL = 'Creating…';
export const SEARCHING_LABEL = 'Searching…';
export const CANNOT_BE_UNDONE_SUFFIX = '? This cannot be undone.';

export function pluralize(count, singular, plural = `${singular}s`) {
	return count === 1 ? singular : plural;
}
