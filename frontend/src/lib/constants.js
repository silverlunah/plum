/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
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
	EXTERNAL: 'external-trigger',
	// Not a Report.triggerType value — only used as the `kind` tag on bg-run-*
	// live-broadcast events, alongside the other values reused for that field.
	CRON: 'cron'
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
export const MAX_TEST_RETRIES = 5;
export const RUN_PICKER_LIMIT = 200;
export const RUN_TAG_DISPLAY_LIMIT = 5;
export const CASE_HISTORY_BARS_MAX = 20;

export const BUILTIN_RUNNER_ID = 'built-in';
