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

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const BROWSERS = [
	{ id: 'chromium', label: 'Chrome' },
	{ id: 'firefox', label: 'Firefox' }
];

export const TRIGGER_TYPES = Object.freeze({
	MANUAL: 'manual-trigger',
	CLI: 'command-line-trigger',
	MCP: 'mcp-trigger',
	EXTERNAL: 'external-trigger'
});

export const REPORTS_PER_PAGE = 15;
export const REPO_PAGE_SIZE = 20;
export const SUITE_CASES_PER_PAGE = 20;

export const COPY_TIMEOUT_MS = 1400;
export const TOAST_TIMEOUT_MS = 4000;

export const REPLAY_STEP_MS = 900;
export const REDIRECT_DELAY_MS = 3000;

export const WORKERS_MIN = 1;
export const WORKERS_MAX = 10;
export const RUN_PICKER_LIMIT = 200;
export const RUN_TAG_DISPLAY_LIMIT = 5;
export const CASE_HISTORY_BARS_MAX = 20;

export const BUILTIN_RUNNER_ID = 'built-in';
export const BUILTIN_RUNNER_LABEL = 'Built-in';
export const ALL_TESTS_LABEL = 'all tests';
export const AUTOMATED_LABEL = 'Automated';
