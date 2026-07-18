/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';

const TOKEN_KEY = 'plum:token';
const USER_KEY = 'plum:user';

function createAuthStore() {
	let initialToken = null;
	let initialUser = null;
	try {
		initialToken = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
		const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
		initialUser = raw ? JSON.parse(raw) : null;
	} catch {}

	const { subscribe, set, update } = writable({ token: initialToken, user: initialUser });

	return {
		subscribe,
		login(token, user) {
			try {
				localStorage.setItem(TOKEN_KEY, token);
				localStorage.setItem(USER_KEY, JSON.stringify(user));
			} catch {}
			set({ token, user });
		},
		logout() {
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
}

export const auth = createAuthStore();
