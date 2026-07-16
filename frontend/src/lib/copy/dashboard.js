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

import { pluralize } from './common';

export const PAGE_TITLE = 'Automated Tests — Plum';
export const HEADING = 'Tests';
export const SEARCH_PLACEHOLDER = 'Search suites or tests…';
export const NO_SUITES_MESSAGE = 'No test suites found.';
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
export const visibleOfTotal = (visible, total) => `${visible} of ${total} tests`;
export const testCountLabel = (count) => `${count} ${pluralize(count, 'test')}`;
export const suiteSummary = (suiteCount, testCount) =>
	`${suiteCount} ${pluralize(suiteCount, 'suite')} · ${testCount} ${pluralize(testCount, 'test')}`;
