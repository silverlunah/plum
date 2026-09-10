/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable } from 'svelte/store';
import {
	fetchNotifications,
	markNotificationRead,
	markAllNotificationsRead
} from '$lib/api/notifications';

// Persistent notification-bell state, distinct from the ephemeral toast queue
// in stores/notifications.js.
export const notificationInbox = writable([]);
export const unreadNotificationCount = writable(0);

export async function loadNotificationInbox() {
	const { notifications, unreadCount } = await fetchNotifications();
	notificationInbox.set(notifications);
	unreadNotificationCount.set(unreadCount);
}

// Called from the socket listener (owned by RunnerPanel.svelte) when a new
// notification arrives live.
export function pushNotification(notification) {
	notificationInbox.update((list) => [notification, ...list]);
	unreadNotificationCount.update((c) => c + 1);
}

export async function markInboxRead(id) {
	notificationInbox.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
	unreadNotificationCount.update((c) => Math.max(0, c - 1));
	markNotificationRead(id).catch(() => {});
}

export async function markInboxAllRead() {
	notificationInbox.update((list) => list.map((n) => ({ ...n, read: true })));
	unreadNotificationCount.set(0);
	markAllNotificationsRead().catch(() => {});
}
