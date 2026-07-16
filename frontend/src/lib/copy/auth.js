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

export const CHECKING_SERVER = 'Checking server…';
export const EMAIL_PLACEHOLDER = 'jane@example.com';

// ── Login ──
export const LOGIN_PAGE_TITLE = 'Sign in — Plum';
export const SIGN_IN_TITLE = 'Sign in';
export const SIGN_IN_SUBTITLE = 'Access your test workspace';
export const PASSWORD_PLACEHOLDER = '••••••••';
export const LOGIN_FAILED_FALLBACK = 'Login failed';

export const signInLabel = (loading) => (loading ? 'Signing in…' : 'Sign in');

// ── Setup ──
export const SETUP_PAGE_TITLE = 'Setup — Plum';
export const WELCOME_TITLE = 'Welcome to Plum';
export const WELCOME_SUBTITLE = 'Create your first account to get started.';
export const YOUR_NAME_LABEL = 'Your name';
export const NAME_PLACEHOLDER = 'Jane Smith';
export const PASSWORD_MIN_PLACEHOLDER = 'Min. 8 characters';
export const ALL_FIELDS_REQUIRED = 'All fields are required.';
export const PASSWORD_MIN_LENGTH_ERROR = 'Password must be at least 8 characters.';
export const SETUP_FAILED_FALLBACK = 'Setup failed';

export const createAccountLabel = (loading) => (loading ? 'Creating account…' : 'Create account');
