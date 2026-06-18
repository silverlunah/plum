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
