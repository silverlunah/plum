/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export const CHECKING_SERVER = 'Checking server…';
export const EMAIL_PLACEHOLDER = 'jane@example.com';

// ── Login ──
export const LOGIN_PAGE_TITLE = 'Sign in, Plum';
export const SIGN_IN_TITLE = 'Sign in';
export const SIGN_IN_SUBTITLE = 'Access your test workspace';
export const PASSWORD_PLACEHOLDER = '••••••••';
export const LOGIN_FAILED_FALLBACK = 'Login failed';

export const signInLabel = (loading) => (loading ? 'Signing in…' : 'Sign in');

// ── Setup ──
export const SETUP_PAGE_TITLE = 'Setup, Plum';

export const YOUR_NAME_LABEL = 'Your name';
export const NAME_PLACEHOLDER = 'Jane Smith';
export const PASSWORD_MIN_PLACEHOLDER = 'Min. 8 characters';
export const ALL_FIELDS_REQUIRED = 'All fields are required.';
export const PASSWORD_MIN_LENGTH_ERROR = 'Password must be at least 8 characters.';
export const SETUP_FAILED_FALLBACK = 'Setup failed';

export const SETUP_STEP_ORG_TITLE = 'Name your organization';
export const SETUP_STEP_ORG_SUBTITLE =
	'Plus a first project, a project keeps its tests and reports separate.';
export const SETUP_STEP_ADMIN_TITLE = 'Create your admin account';
export const SETUP_STEP_ADMIN_SUBTITLE = 'You can add more people and projects once you are in.';
export const ORG_NAME_LABEL = 'Organization name';
export const ORG_NAME_PLACEHOLDER = 'Acme Inc.';
export const PROJECT_NAME_LABEL = 'First project name';
export const PROJECT_NAME_PLACEHOLDER = 'Checkout';
export const SETUP_FRAMEWORK_LABEL = 'Test framework';
export const SETUP_FRAMEWORK_HINT = "Permanent once this project is created, can't switch later.";
export const SETUP_CONTINUE_LABEL = 'Continue';
export const SETUP_BACK_LABEL = 'Back';
export const setupStepLabel = (n, total) => `Step ${n} of ${total}`;

export const createAccountLabel = (loading) => (loading ? 'Creating account…' : 'Finish setup');
