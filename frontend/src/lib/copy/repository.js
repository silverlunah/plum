/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { pluralize } from './common';

export const TEST_REPOSITORY_BREADCRUMB = 'Test Repository';
export const NAME_LABEL = 'Name';
export const DESCRIPTION_LABEL = 'Description';
export const PRIORITY_LABEL = 'Priority';
export const TITLE_LABEL = 'Title';
export const NAME_REQUIRED_ERROR = 'Name is required.';
export const TITLE_REQUIRED_ERROR = 'Title is required.';

// ── Repository list ──
export const PAGE_TITLE = 'Test Repository — Plum';
export const HEADING = 'Test Repository';
export const HEADER_DESC = 'Manage test suites, cases, and track manual test runs.';
export const NEW_SUITE_LABEL = '+ New Suite';
export const NEW_RUN_LABEL = '+ New Run';
export const SUITES_TAB_LABEL = 'Suites';
export const RUNS_TAB_LABEL = 'Test Runs';
export const SEARCH_PLACEHOLDER = 'Search by ID or name…';
export const NO_RESULTS_TITLE = 'No results';
export const CASES_LABEL = 'Cases';
export const SUITES_LABEL = 'Suites';
export const RUNS_LABEL = 'Runs';
export const AUTOMATED_TAG_LABEL = 'automated';
export const DELETE_SUITE_TITLE = 'Delete suite';
export const DELETE_RUN_TITLE = 'Delete run';
export const DUPLICATE_RUN_ACTION_TITLE = 'Duplicate run';
export const NO_SUITES_YET_TITLE = 'No test suites yet';
export const NO_SUITES_YET_DESC = 'Create your first suite to start organising test cases.';
export const NO_RUNS_YET_TITLE = 'No test runs yet';
export const NO_RUNS_YET_DESC = 'Create a test run to start executing and tracking manual tests.';
export const NEW_SUITE_MODAL_TITLE = 'New Test Suite';
export const NEW_RUN_MODAL_TITLE = 'New Test Run';
export const SUITE_NAME_PLACEHOLDER = 'Login flows';
export const SUITE_DESC_PLACEHOLDER = 'What this suite covers…';
export const RUN_TITLE_PLACEHOLDER = 'Sprint 12 regression';
export const DUPLICATE_RUN_MODAL_TITLE = 'Duplicate Run';
export const DUPLICATE_LABEL = 'Duplicate';
export const DUPLICATE_CONFIRM_SUFFIX = '? A copy will be added at the top of the list.';
export const FAILED_TO_LOAD_DATA = 'Failed to load data';
export const FAILED_TO_DELETE_SUITE = 'Failed to delete suite.';
export const FAILED_TO_DUPLICATE_RUN = 'Failed to duplicate run.';
export const FAILED_TO_DELETE_RUN = 'Failed to delete run.';

export const noResultsDescription = (search) => `Nothing matches "${search}".`;
export const createdByLabel = (name) => `by ${name}`;
export const caseCount = (count) => `${count} ${pluralize(count, 'case')}`;
export const createSuiteLabel = (saving) => (saving ? 'Creating…' : 'Create Suite');
export const createRunLabel = (saving) => (saving ? 'Creating…' : 'Create Run');
export const deleteEntityTitle = (type) => `Delete ${type === 'suite' ? 'Suite' : 'Run'}`;
export const suiteCreatedToast = (name) => `Suite "${name}" created.`;
export const suiteDeletedToast = (name) => `Suite "${name}" deleted.`;
export const duplicatedAsToast = (title) => `Duplicated as "${title}".`;
export const runDeletedToast = (title) => `Run "${title}" deleted.`;

// ── Suite detail ──
export const DELETE_TEST_CASE_TITLE = 'Delete Test Case';
export const NEW_TEST_CASE_MODAL_TITLE = 'New Test Case';
export const TC_TITLE_PLACEHOLDER = 'User can log in with valid credentials';
export const TC_DESC_PLACEHOLDER = 'What this case verifies…';
export const CREATE_CASE_LABEL = 'Create Case';
export const EDIT_SUITE_MODAL_TITLE = 'Edit Suite';
export const EDIT_SUITE_TITLE = 'Edit suite';
export const EDIT_CASE_TITLE = 'Edit case';
export const TEST_CASES_LABEL = 'Test Cases';
export const ADD_CASE_LABEL = '+ Add Case';
export const FILTER_PLACEHOLDER = 'Filter by ID or name…';
export const NO_CASES_YET_TITLE = 'No cases yet';
export const NO_CASES_YET_DESC = 'Add your first test case to this suite.';
export const NO_CASES_MATCH_PREFIX = 'No cases match';
export const DATE_LABEL = 'Date';
export const STEP_LABEL = 'Step';
export const ACTION_COL_LABEL = 'Action';
export const TEST_DATA_LABEL = 'Test Data';
export const EXPECTED_OUTPUT_LABEL = 'Expected Output';
export const STEP_ACTION_PLACEHOLDER = 'Describe the action…';
export const OPTIONAL_PLACEHOLDER = 'Optional';
export const EXPECTED_OUTPUT_PLACEHOLDER = 'What should happen…';
export const NO_STEPS_MESSAGE = 'No steps. Click "+ Add step" to begin.';
export const ADD_STEP_LABEL = '+ Add step';
export const EDIT_STEPS_LABEL = 'Edit Steps';
export const NO_STEPS_DEFINED_MESSAGE = 'No steps defined. Click "Edit Steps" to add them.';
export const STEPS_TAB_LABEL = 'Steps';
export const HISTORY_TAB_LABEL = 'History';
export const NO_HISTORY_MESSAGE =
	'No history yet. Results appear after test runs or automated builds.';
export const AUTOMATED_RUN_LINK = 'Automated run ↗';
export const REPORT_NOT_FOUND = 'Report not found';
export const RUN_NOT_FOUND = 'Run not found';
export const FAILED_TO_LOAD_SUITE = 'Failed to load suite';
export const FAILED_TO_LOAD_CASE = 'Failed to load case';
export const FAILED_TO_DELETE_CASE = 'Failed to delete case.';
export const TEST_CASE_UPDATED_TOAST = 'Test case updated.';
export const STEPS_SAVED_TOAST = 'Steps saved.';
export const SUITE_UPDATED_TOAST = 'Suite updated.';

export const suiteDetailTitle = (suite) =>
	`${suite ? `${suite.displayId} — ${suite.name}` : 'Suite'} — Plum`;
export const createdByCapitalized = (name) => `Created by ${name}`;
export const caseCreatedToast = (displayId) => `${displayId} created.`;
export const caseDeletedToast = (displayId) => `${displayId} deleted.`;
export const stepCount = (count) => `${count} ${pluralize(count, 'step')}`;
export const saveStepsLabel = (saving) => (saving ? 'Saving…' : 'Save Steps');
export const runLinkLabel = (title) => `${title} ↗`;

// ── Run detail ──
export const EDIT_RUN_MODAL_TITLE = 'Edit Run';
export const EDIT_RUN_TITLE = 'Edit run';
export const REOPEN_LABEL = 'Reopen';
export const START_EXECUTION_LABEL = 'Start Execution';
export const STOP_EXECUTION_LABEL = 'Stop Execution';
export const EDIT_RUN_BACK_LABEL = '← Edit Run';
export const MARK_COMPLETE_LABEL = 'Mark Complete';
export const BUILD_TAB_LABEL = 'Build';
export const EXECUTE_TAB_LABEL = 'Execute';
export const IN_THIS_RUN_LABEL = 'In this run';
export const LOCKED_BADGE = 'locked';
export const NO_CASES_IN_RUN_MESSAGE = 'No cases in this run.';
export const UNASSIGNED_OPTION = 'Unassigned';
export const SUITE_BROWSER_LABEL = 'Suite browser';
export const SEARCH_CASES_PLACEHOLDER = 'Search cases…';
export const NO_MATCHING_CASES = 'No matching cases';
export const NO_CASES_IN_SUITE = 'No cases in this suite';
export const ALL_CASES_ADDED = 'All cases added';
export const NO_SUITES_AVAILABLE = 'No suites available.';
export const NOT_IN_PROGRESS_BANNER =
	'This run is not in progress — start execution to record results.';
export const TOGGLE_STEPS_TITLE = 'Toggle steps';
export const ASSIGN_TO_ME_LABEL = 'Assign to me';
export const IN_PROGRESS_LABEL = 'In Progress';
export const PASS_LABEL = 'Pass';
export const FAIL_LABEL = 'Fail';
export const BLOCKED_LABEL = 'Blocked';
export const SKIP_LABEL = 'Skip';
export const RESET_TO_PENDING_TITLE = 'Reset to pending';
export const RESET_LABEL = '↩ Reset';
export const FAILED_TO_ADD_CASE = 'Failed to add case.';
export const RUN_UPDATED_TOAST = 'Run updated.';
export const RUN_SAVED_TOAST = 'Run saved.';
export const RUN_MARKED_COMPLETE_TOAST = 'Run marked as complete.';
export const RUN_REOPENED_TOAST = 'Run reopened.';

export const runDetailTitle = (run) => `${run?.title ?? 'Test Run'} — Plum`;
export const passedCount = (count) => `${count} passed`;
export const failedCount = (count) => `${count} failed`;
export const remainingCount = (count) => `${count} remaining`;
export const stepDataLabel = (data) => `Data: ${data}`;
export const stepExpectedLabel = (expected) => `Expected: ${expected}`;
