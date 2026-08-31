/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { pluralize } from './common';

export const PAGE_TITLE = 'Automated Tests — Plum';
export const HEADING = 'Automated Tests';
export const SEARCH_PLACEHOLDER = 'Search suites or tests…';
export const NO_SUITES_MESSAGE = 'No test suites found.';
export const REPO_MANAGED_NOTE =
	'Automated tests live in your project’s test repository. This list follows the folder — add, edit or remove a feature file and it updates here on its own.';
export const RUN_SUITE_LABEL = 'Run suite';
export const OUTLINE_BADGE = 'outline';
export const HIDE_LABEL = 'Hide';
export const STEPS_LABEL = 'Steps';
export const EXAMPLES_LABEL = 'Examples';

export const noMatchMessage = (search) => `No tests matching "${search}"`;
export const copiedTitle = (id) => `Copied ${id}`;
export const copyTitle = (id) => `Copy ${id}`;
export const runIdTitle = (pid) => `Run ${pid}`;
export const runTestLabel = (name) => `Run ${name}`;
export const collapseOrExpandSuiteLabel = (expanded) =>
	expanded ? 'Collapse suite' : 'Expand suite';
export const visibleOfTotal = (visible, total) => `${visible} of ${total} tests`;
export const testCountLabel = (count) => `${count} ${pluralize(count, 'test')}`;
export const suiteSummary = (suiteCount, testCount) =>
	`${suiteCount} ${pluralize(suiteCount, 'suite')} · ${testCount} ${pluralize(testCount, 'test')}`;
