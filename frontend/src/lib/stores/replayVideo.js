/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { writable, get } from 'svelte/store';
import { renderReplayToWebM } from '$lib/utils/replayVideo';
import { downloadBlob } from '$lib/utils/download';

// null when idle; otherwise { status, progress, filename, error }.
// status: 'rendering' | 'done' | 'error'
export const replayVideoJob = writable(null);

let cancelled = false;

export function cancelReplayVideo() {
	cancelled = true;
}

export function dismissReplayVideo() {
	replayVideoJob.set(null);
}

/** `replayer` is the live rrweb replayer to record; it is not retained. */
export async function startReplayVideo({ replayer, durationMs, filename }) {
	if (get(replayVideoJob)?.status === 'rendering') return;
	cancelled = false;
	replayVideoJob.set({ status: 'rendering', progress: 0, filename });

	try {
		const blob = await renderReplayToWebM({
			replayer,
			durationMs,
			onProgress: (p) => replayVideoJob.update((j) => (j ? { ...j, progress: p } : j)),
			shouldCancel: () => cancelled
		});
		if (cancelled) {
			replayVideoJob.set(null);
			return;
		}
		downloadBlob(blob, filename);
		replayVideoJob.set({ status: 'done', progress: 1, filename });
		setTimeout(() => replayVideoJob.update((j) => (j?.status === 'done' ? null : j)), 6000);
	} catch (e) {
		if (cancelled || e.message === 'Cancelled.') {
			replayVideoJob.set(null);
			return;
		}
		replayVideoJob.set({ status: 'error', progress: 0, filename, error: e.message });
	}
}
