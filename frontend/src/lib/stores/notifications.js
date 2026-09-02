/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';
import { TOAST_TIMEOUT_MS } from '$lib/constants';

// { id, type: 'success' | 'error' | 'info', message, sticky, loading }
export const notifications = writable([]);

let seq = 0;

export function notify(
	type,
	message,
	{ sticky = false, loading = false, timeout = TOAST_TIMEOUT_MS } = {}
) {
	const id = ++seq;
	// A loading toast stays until the caller settles it.
	const isSticky = sticky || loading;
	notifications.update((list) => [...list, { id, type, message, sticky: isSticky, loading }]);
	if (!isSticky) setTimeout(() => dismissNotification(id), timeout);
	return id;
}

export function dismissNotification(id) {
	notifications.update((list) => list.filter((n) => n.id !== id));
}

// Swaps a live toast in place, e.g. a loading toast to its success/error result.
export function updateNotification(id, patch) {
	notifications.update((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
}

/**
 * Shows a loading toast and returns a `settle(type, message)` that turns it into
 * a normal auto-dismissing toast. For import / export / upload feedback.
 */
export function notifyProgress(message) {
	const id = notify('info', message, { loading: true });
	return (type, finalMessage) => {
		updateNotification(id, { type, message: finalMessage, loading: false, sticky: false });
		setTimeout(() => dismissNotification(id), TOAST_TIMEOUT_MS);
	};
}
