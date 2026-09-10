/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { SOCKET_EVENTS } = require('../constants/socketEvents');

const LIST_LIMIT = 50;

let _io = null;
function setSocketIO(io) {
	_io = io;
}

const select = {
	id: true,
	projectId: true,
	type: true,
	title: true,
	body: true,
	link: true,
	read: true,
	createdAt: true
};

async function list(userId) {
	const [notifications, unreadCount] = await Promise.all([
		prisma.notification.findMany({
			where: { userId },
			select,
			orderBy: { createdAt: 'desc' },
			take: LIST_LIMIT
		}),
		prisma.notification.count({ where: { userId, read: false } })
	]);
	return { notifications, unreadCount };
}

// Fire-and-forget from the caller's perspective: a notification failing to
// send should never break whatever triggered it.
async function create({ userId, projectId, type, title, body, link }) {
	const notification = await prisma.notification.create({
		data: {
			userId,
			projectId: projectId ?? null,
			type,
			title,
			body: body ?? '',
			link: link ?? ''
		},
		select
	});
	_io?.to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION_NEW, notification);
	return notification;
}

async function markRead(userId, id) {
	const { count } = await prisma.notification.updateMany({
		where: { id, userId },
		data: { read: true }
	});
	return count > 0;
}

async function markAllRead(userId) {
	await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

module.exports = { setSocketIO, list, create, markRead, markAllRead };
