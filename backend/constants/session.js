/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Hours a login session lasts before the user is forced back to the login
// screen. Offered as fixed choices in Settings → Users (owner only); mirrored
// on the frontend as SESSION_TIMEOUT_OPTIONS.
const SESSION_MAX_HOURS_OPTIONS = Object.freeze([6, 12, 18, 24]);
const DEFAULT_SESSION_MAX_HOURS = 24;

const isSessionMaxHours = (h) => SESSION_MAX_HOURS_OPTIONS.includes(Number(h));

module.exports = { SESSION_MAX_HOURS_OPTIONS, DEFAULT_SESSION_MAX_HOURS, isSessionMaxHours };
