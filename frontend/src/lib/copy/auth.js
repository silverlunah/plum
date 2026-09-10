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

export const POWERED_BY_LABEL = 'Powered by';
export const LOGIN_METHOD_DIVIDER = 'or';
export const GOOGLE_SIGN_IN_LABEL = 'Sign in with Google';

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
export const SETUP_STEP_REPO_TITLE = 'Connect your tests';
export const SETUP_STEP_REPO_SUBTITLE =
	'Optional, only GitHub is supported here, do this later in Settings if you prefer.';
export const SETUP_STEP_ADMIN_TITLE = 'Create your admin account';
export const SETUP_STEP_ADMIN_SUBTITLE = 'You can add more people and projects once you are in.';

export const REPO_MODE_SKIP_LABEL = "I'll do this later";
export const REPO_MODE_EXISTING_LABEL = 'Existing GitHub repo';
export const REPO_MODE_NEW_LABEL = 'New GitHub repo';

export const SETUP_GITHUB_TOKEN_LABEL = 'GitHub personal access token';
export const SETUP_GITHUB_TOKEN_HINT =
	'Fine-grained, with repo scope ("Administration: write" too, to create a new repo).';
export const SETUP_GITHUB_TOKEN_PLACEHOLDER = 'github_pat_…';

export const REPO_OWNER_LABEL = 'Owner';
export const REPO_OWNER_PLACEHOLDER = 'silverlunah';
export const REPO_NAME_LABEL = 'Repository';
export const REPO_NAME_PLACEHOLDER = 'plum-tests';
export const REPO_BRANCH_LABEL = 'Default branch';
export const REPO_BRANCH_PLACEHOLDER = 'main';
export const REPO_TESTS_SUBPATH_LABEL = 'Tests folder';
export const REPO_TESTS_SUBPATH_HINT =
	'Relative path inside the repo, e.g. apps/web/e2e for a monorepo.';
export const REPO_TESTS_SUBPATH_PLACEHOLDER = 'tests';

export const NEW_REPO_NAME_LABEL = 'New repository name';
export const NEW_REPO_NAME_HINT =
	'Created as a private repo and pushed with the scaffolded tests as its first commit. Leave blank to just set up git locally.';
export const NEW_REPO_NAME_PLACEHOLDER = 'plum-tests';
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

// ── Restore instead ──
export const RESTORE_INSTEAD_LABEL = 'Recovering a lost server? Restore from a backup instead.';
export const RESTORE_TITLE = 'Restore from a backup';
export const RESTORE_SUBTITLE =
	'Upload the JSON file from Settings → Backup → Download. Your original owner, projects and data come back as they were, skipping the setup above.';
export const RESTORE_FILE_LABEL = 'Backup file';
export const RESTORE_FILE_REQUIRED_ERROR = 'Choose a backup file first.';
export const INVALID_BACKUP_FILE_ERROR = "That file isn't a valid backup.";
export const RESTORE_FAILED_FALLBACK = 'Restore failed';
export const restoreButtonLabel = (loading) => (loading ? 'Restoring…' : 'Restore');
