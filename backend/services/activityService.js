/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const prisma = require('./prisma');
const { getContext } = require('../lib/requestContext');
const { ACTIVITY_SCOPE, ACTIVITY_SOURCE } = require('../constants/activity');

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function actorLabel(ctx) {
	if (!ctx?.actorName) return 'System';
	return ctx.viaMcp ? `${ctx.actorName} (MCP)` : ctx.actorName;
}

// Write one audit row. Never throws and never blocks the caller's result — a
// failed audit write must not fail the action it was recording.
async function record(
	action,
	{ scope = ACTIVITY_SCOPE.PROJECT, projectId, target, metadata } = {}
) {
	try {
		const ctx = getContext();
		await prisma.activityLog.create({
			data: {
				scope,
				projectId: scope === ACTIVITY_SCOPE.ORG ? null : (projectId ?? ctx?.projectId ?? null),
				actorId: ctx?.actorId ?? null,
				actorLabel: actorLabel(ctx),
				action,
				targetType: target?.type ?? '',
				targetId: target?.id != null ? String(target.id) : '',
				targetLabel: target?.label ?? '',
				metadata: metadata ?? undefined,
				source: ctx?.source ?? ACTIVITY_SOURCE.CRON
			}
		});
	} catch (e) {
		console.error(`[activity] failed to record ${action}:`, e.message);
	}
}

async function list({
	scope,
	projectId,
	page = 1,
	limit = DEFAULT_LIMIT,
	action,
	actorId,
	q
} = {}) {
	const take = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
	const skip = (Math.max(1, Number(page) || 1) - 1) * take;
	const term = (q ?? '').trim();
	const where = {
		scope,
		...(scope === ACTIVITY_SCOPE.PROJECT && projectId != null ? { projectId } : {}),
		...(action ? { action } : {}),
		...(actorId ? { actorId } : {}),
		...(term
			? {
					OR: [
						{ targetLabel: { contains: term, mode: 'insensitive' } },
						{ actorLabel: { contains: term, mode: 'insensitive' } }
					]
				}
			: {})
	};
	const [rows, total] = await Promise.all([
		prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
		prisma.activityLog.count({ where })
	]);
	return { entries: rows, total, page: Math.max(1, Number(page) || 1), limit: take };
}

// The distinct actions and actors present in a scope — powers the filter
// dropdowns without the client hard-coding a list that could drift from reality.
async function filterOptions({ scope, projectId } = {}) {
	const where = {
		scope,
		...(scope === ACTIVITY_SCOPE.PROJECT && projectId != null ? { projectId } : {})
	};
	const [actions, actors] = await Promise.all([
		prisma.activityLog.findMany({
			where,
			distinct: ['action'],
			select: { action: true },
			orderBy: { action: 'asc' }
		}),
		prisma.activityLog.findMany({
			where: { ...where, actorId: { not: null } },
			distinct: ['actorId'],
			select: { actorId: true, actorLabel: true },
			orderBy: { actorLabel: 'asc' }
		})
	]);
	return {
		actions: actions.map((a) => a.action),
		actors: actors.map((a) => ({ id: a.actorId, label: a.actorLabel }))
	};
}

async function prune(retentionDays) {
	const days = Number(retentionDays);
	if (!Number.isFinite(days) || days <= 0) return { count: 0 };
	const cutoff = new Date(Date.now() - days * 86_400_000);
	return prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

module.exports = { record, list, filterOptions, prune };
