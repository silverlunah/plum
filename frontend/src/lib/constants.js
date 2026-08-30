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
export const ACTIVITY_PER_PAGE = 30;
// Retention windows (days) offered in Settings → Activity. 0 = keep forever.
// Mirrors backend/constants/activity.js ACTIVITY_RETENTION_DAYS.
export const ACTIVITY_RETENTION_DAYS = [0, 30, 90, 180, 365];

export const COPY_TIMEOUT_MS = 1400;
export const TOAST_TIMEOUT_MS = 8000;

export const REDIRECT_DELAY_MS = 3000;

export const WORKERS_MIN = 1;
export const WORKERS_MAX = 10;
export const MAX_TEST_RETRIES = 5;
export const RUN_PICKER_LIMIT = 200;
export const RUN_TAG_DISPLAY_LIMIT = 5;
export const CASE_HISTORY_BARS_MAX = 20;

// Replay inspector panel: its default size and the floor it can be resized to.
// The player reserves exactly this much width; anything wider overlays the replay.
export const INSPECTOR_MIN_WIDTH = 280;

export const BUILTIN_RUNNER_ID = 'built-in';
