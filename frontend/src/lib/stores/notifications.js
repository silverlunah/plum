/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';
import { TOAST_TIMEOUT_MS } from '$lib/constants';

// { id, type: 'success' | 'error' | 'info', message, sticky }
export const notifications = writable([]);

let seq = 0;

export function notify(type, message, { sticky = false, timeout = TOAST_TIMEOUT_MS } = {}) {
	const id = ++seq;
	notifications.update((list) => [...list, { id, type, message, sticky }]);
	if (!sticky) setTimeout(() => dismissNotification(id), timeout);
	return id;
}

export function dismissNotification(id) {
	notifications.update((list) => list.filter((n) => n.id !== id));
}
