/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const BROWSERS = [
	{ id: 'chromium', label: 'Chrome' },
	{ id: 'firefox', label: 'Firefox' }
];

// Mirrors backend/constants/defaults.js FRAMEWORKS. The first entry is what the
// project-create form pre-selects, so the offered default is this list's order
// and nothing else, a separate UI default would drift from the CLI's.
// Labels live in copy/settings.js.
export const FRAMEWORKS = ['playwright', 'cucumber'];

export const TRIGGER_TYPES = Object.freeze({
	MANUAL: 'manual-trigger',
	CLI: 'command-line-trigger',
	MCP: 'mcp-trigger',
	EXTERNAL: 'external-trigger',
	// Not a Report.triggerType value, only used as the `kind` tag on bg-run-*
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
// Retention windows (days) offered in Settings → Backup for report history.
// Mirrors backend/constants/activity.js REPORT_RETENTION_DAYS.
export const REPORT_RETENTION_DAYS = [0, 30, 60, 90];

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

// Must match the `@media (max-width: …)` values hard-coded in component styles.
export const MOBILE_MAX = 640;
export const TABLET_MAX = 1024;

export const BUILTIN_RUNNER_ID = 'built-in';

export const DOCS_URL = 'https://outline.silverlunah.com/s/12bf21d1-02ba-49e9-b0df-908976407afd';
export const PLAYWRIGHT_URL = 'https://playwright.dev';
export const CUCUMBER_URL = 'https://cucumber.io';
