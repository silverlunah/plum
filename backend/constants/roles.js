/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// User.role. owner: every project + every setting, account-wide. admin: full
// settings, but only for assigned projects. user: assigned projects, no settings.
const ROLE = Object.freeze({ OWNER: 'owner', ADMIN: 'admin', USER: 'user' });

// Roles with elevated (settings) access within a project they can reach.
const ELEVATED_ROLES = Object.freeze([ROLE.OWNER, ROLE.ADMIN]);

module.exports = { ROLE, ELEVATED_ROLES };
