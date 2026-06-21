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

import { TRIGGER_TYPES } from '$lib/constants';

const NON_SCHEDULED = new Set([
	TRIGGER_TYPES.MANUAL,
	TRIGGER_TYPES.CLI,
	TRIGGER_TYPES.MCP,
	'undefined'
]);

export function isScheduled(type) {
	return !!type && !NON_SCHEDULED.has(type);
}

export function triggerLabel(type) {
	if (type === TRIGGER_TYPES.MANUAL) return 'Manual';
	if (type === TRIGGER_TYPES.CLI || type === 'undefined') return 'CLI';
	if (type === TRIGGER_TYPES.MCP) return 'MCP';
	return 'Scheduled';
}

export function triggerVariant(type) {
	if (type === TRIGGER_TYPES.MANUAL) return 'tag';
	if (type === TRIGGER_TYPES.CLI || type === 'undefined') return 'neutral';
	if (type === TRIGGER_TYPES.MCP) return 'mcp';
	return 'schedule';
}

/** Returns an inline style string for staggered fadeUp animations. */
export function stagger(i, stepMs = 45) {
	return `animation-delay: ${i * stepMs}ms`;
}

export function fmtDuration(ms) {
	if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
	return ms + 'ms';
}

/**
 * Trims a Cucumber feature URI to a readable suffix. Dispatched runs report an
 * absolute temp path on the node (…/plum-job-<uuid>/features/Login.feature); show
 * only the part from `features/` onward so the column stays short.
 */
export function featureFile(uri) {
	if (!uri) return '';
	const normalized = uri.replace(/\\/g, '/');
	const idx = normalized.lastIndexOf('/features/');
	if (idx !== -1) return normalized.slice(idx + 1);
	return normalized.split('/').pop();
}
