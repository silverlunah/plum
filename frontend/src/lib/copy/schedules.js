/*
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 */

export const PAGE_TITLE = 'Scheduled Tests — Plum';
export const HEADING = 'Scheduled Tests';
export const SUBTITLE = 'Manage recurring test runs via cron jobs';
export const NEW_JOB_LABEL = '+ New Job';
export const NO_JOBS_MESSAGE = 'No scheduled tests yet. Create one to get started.';

export const TASK_NAME_LABEL = 'Task Name';
export const TASK_NAME_HINT = 'Use a unique, meaningful name';
export const TASK_NAME_PLACEHOLDER = 'nightly-login-suite';
export const SCHEDULE_LABEL = 'Schedule';
export const SELECT_SCHEDULE_PLACEHOLDER = 'Select a schedule';
export const CUSTOM_OPTION_LABEL = 'Custom…';
export const CRON_PLACEHOLDER = '0 9 * * 1-5';
export const INVALID_CRON_MESSAGE = 'Invalid cron expression';
export const TAGS_LABEL = 'Tags';
export const TAGS_HINT = 'Multiple: @test-1 or @test-2. Leave blank to run all tests';
export const TAGS_PLACEHOLDER = '@suite-login (optional)';
export const WORKERS_LABEL = 'Workers';
export const WORKERS_HINT = 'Parallel workers for this job';
export const BROWSER_LABEL = 'Browser';
export const RUNNERS_LABEL = 'Runners';
export const RUNNERS_HINT = 'Select one or more nodes';
export const THIS_SERVER_HINT = 'this server';
export const NOTIFICATIONS_LABEL = 'Notifications';

export const ALL_FIELDS_REQUIRED = 'All fields are required.';
export const INVALID_CRON_EXPRESSION_ERROR = 'Invalid cron expression.';
export const SAVE_FAILED_MESSAGE = 'Failed to save. Please try again.';
export const NETWORK_ERROR = 'Network error.';
export const COULD_NOT_UPDATE_SCHEDULE = 'Could not update schedule.';
export const COULD_NOT_TRIGGER_RUN = 'Could not trigger run.';
export const COULD_NOT_DELETE_JOB = 'Could not delete cron job.';

export const DELETE_CRON_JOB_TITLE = 'Delete Cron Job';
export const DELETE_CONFIRM_PREFIX = 'Are you sure you want to delete';

export const DISABLE_SCHEDULE_LABEL = 'Disable schedule';
export const ENABLE_SCHEDULE_LABEL = 'Enable schedule';
export const RUNNING_NOW_TITLE = 'Running now';

export const TH_NAME = 'Name';
export const TH_SCHEDULE = 'Schedule';
export const TH_TAGS = 'Tags';
export const TH_WORKERS = 'Workers';
export const TH_BROWSER = 'Browser';
export const TH_RUNNER = 'Runner';
export const TH_ACTIONS = 'Actions';

export const modalTitle = (isEditing) => (isEditing ? 'Edit Cron Job' : 'New Cron Job');
export const saveChangesLabel = (isEditing) => (isEditing ? 'Save Changes' : 'Add Cron Job');
export const toggleTitle = (enabled) => (enabled ? DISABLE_SCHEDULE_LABEL : ENABLE_SCHEDULE_LABEL);
export const runNowTitle = (taskName) => `Run ${taskName} now`;
export const multiNodeLabel = (count) => `${count} nodes`;
export const savedToast = (isEditing, name) => `${isEditing ? 'Updated' : 'Added'}: ${name}`;
export const startedToast = (name) => `Started: ${name}`;
export const deletedToast = (name) => `Deleted: ${name}`;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeCron(expr) {
	if (!expr) return '';
	const parts = expr.trim().split(/\s+/);
	if (parts.length !== 5) return '';
	const [min, hour, dom, month, dow] = parts;
	const fmt = (h, m) => {
		const ap = h >= 12 ? 'PM' : 'AM';
		return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
	};
	const isNum = (s) => /^\d+$/.test(s);
	const h = isNum(hour) ? +hour : null;
	const m = isNum(min) ? +min : null;

	if (expr === '* * * * *') return 'Every minute';
	const everyN = min.match(/^\*\/(\d+)$/);
	if (everyN && hour === '*' && dom === '*' && month === '*' && dow === '*')
		return `Every ${everyN[1]} minutes`;
	if (m !== null && hour === '*' && dom === '*' && month === '*' && dow === '*')
		return `Every hour at :${String(m).padStart(2, '0')}`;
	if (m !== null && h !== null && dom === '*' && month === '*' && dow === '1-5')
		return `Weekdays at ${fmt(h, m)}`;
	if (m !== null && h !== null && dom === '*' && month === '*' && dow === '*')
		return `Daily at ${fmt(h, m)}`;
	if (m !== null && h !== null && dom === '*' && month === '*' && /^\d$/.test(dow))
		return `Every ${DAYS[+dow]} at ${fmt(h, m)}`;
	const d = isNum(dom) ? +dom : null;
	if (m !== null && h !== null && d !== null && month === '*' && dow === '*') {
		const sfx = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
		return `Monthly on the ${d}${sfx} at ${fmt(h, m)}`;
	}
	return '';
}
