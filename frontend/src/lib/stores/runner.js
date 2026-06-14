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

import { writable, get } from 'svelte/store';

export const socket = writable(null);

export const runnerState = writable({
	output: 'Ready — select a test from the list.\n',
	running: false,
	testCompleted: false,
	latestReport: null,
	status: 'idle', // 'idle' | 'running' | 'pass' | 'fail'
	lastRunId: '',
});

export const runnerConfig = writable({
	workers: 1,
	testID: '',
});

export const panelExpanded = writable(true);

export function triggerRun(id) {
	const s = get(socket);
	if (!s) return;

	const { workers, testID } = get(runnerConfig);
	const runId = (id !== undefined ? id : testID).trim().replace(/\sOR\s/gi, (m) => m.toLowerCase());

	runnerState.set({
		output: `Running: ${runId || '(all tests)'}\n`,
		running: true,
		testCompleted: false,
		latestReport: null,
		status: 'running',
		lastRunId: runId,
	});
	panelExpanded.set(true);
	s.emit('run-test', runId, workers);
}
