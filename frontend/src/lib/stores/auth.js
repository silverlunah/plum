/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';

const TOKEN_KEY = 'plum:token';
const USER_KEY = 'plum:user';

// Epoch ms of the token's JWT `exp` claim, or null if it can't be read.
function tokenExpiry(token) {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}

function createAuthStore() {
	let initialToken = null;
	let initialUser = null;
	try {
		initialToken = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
		initialUser = raw ? JSON.parse(raw) : null;
	} catch {}

	// A session that already outlived the org's timeout: start logged out so the
	// layout guard sends the user to /login on this load.
	if (initialToken) {
		const exp = tokenExpiry(initialToken);
		if (exp !== null && exp <= Date.now()) {
			try {
				localStorage.removeItem(TOKEN_KEY);
				localStorage.removeItem(USER_KEY);
			} catch {}
			initialToken = null;
			initialUser = null;
		}
	}

	const { subscribe, set } = writable({ token: initialToken, user: initialUser });

	let logoutTimer = null;

	function clearLogoutTimer() {
		if (logoutTimer) {
			clearTimeout(logoutTimer);
			logoutTimer = null;
		}
	}

	// Force the session to end the moment its token expires, dropping the user on
	// the login screen. The API rejects the stale token anyway; this makes it a
	// clean redirect instead of a page full of failed requests.
	function scheduleLogout(token) {
		clearLogoutTimer();
		if (typeof window === 'undefined') return;
		const exp = tokenExpiry(token);
		if (exp === null) return;
		logoutTimer = setTimeout(
			() => {
				store.logout();
				window.location.href = '/login';
			},
			Math.max(0, exp - Date.now())
		);
	}

	const store = {
		subscribe,
		login(token, user) {
			try {
				localStorage.setItem(TOKEN_KEY, token);
				localStorage.setItem(USER_KEY, JSON.stringify(user));
			} catch {}
			set({ token, user });
			scheduleLogout(token);
		},
		logout() {
			clearLogoutTimer();
			try {
				localStorage.removeItem(TOKEN_KEY);
				localStorage.removeItem(USER_KEY);
			} catch {}
			set({ token: null, user: null });
		},
		getToken() {
			try {
				return localStorage.getItem(TOKEN_KEY);
			} catch {
				return null;
			}
		}
	};

	if (initialToken) scheduleLogout(initialToken);

	return store;
}

export const auth = createAuthStore();
