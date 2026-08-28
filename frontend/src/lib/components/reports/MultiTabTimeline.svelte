<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { createEventDispatcher } from 'svelte';

	// Replaces rrweb-player's own timeline for multi-tab recordings — rrweb's
	// timeline belongs to whichever player is currently mounted and resets on
	// every segment hand-off, so it can't track absolute position across tabs.
	export let from = 0;
	export let to = 0;
	export let position = 0;
	export let stepTimestamps = [];

	const dispatch = createEventDispatcher();

	function percentOf(ts) {
		return to > from ? Math.min(100, Math.max(0, ((ts - from) / (to - from)) * 100)) : 0;
	}

	function fmtClock(ms) {
		if (ms <= 0) return '00:00';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function handleClick(e) {
		const rect = e.currentTarget.getBoundingClientRect();
		const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		dispatch('seek', from + pct * (to - from));
	}

	$: percent = percentOf(position);
	// Mirrors rrweb-player's own per-step tick marks (its `customEvents` rendering).
	$: tickPercents = stepTimestamps.map(percentOf);
</script>

<div class="combined-timeline">
	<span class="combined-timeline-time">{fmtClock(position - from)}</span>
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="combined-timeline-track" on:click={handleClick}>
		<div class="combined-timeline-fill" style="width: {percent}%"></div>
		{#each tickPercents as pct}
			<div class="combined-timeline-tick" style="left: {pct}%"></div>
		{/each}
		<div class="combined-timeline-handle" style="left: {percent}%"></div>
	</div>
	<span class="combined-timeline-time">{fmtClock(to - from)}</span>
</div>

<style>
	/* Matches rrweb-player's own .rr-timeline/.rr-progress/.rr-progress__step/
	   .rr-progress__handler (dist/style.css) so this reads as the same control. */
	.combined-timeline {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 38px;
		width: 80%;
		margin: 0 auto;
		display: flex;
		align-items: center;
	}

	.combined-timeline-time {
		flex-shrink: 0;
		display: inline-block;
		width: 100px;
		text-align: center;
		color: #11103e;
	}

	.combined-timeline-track {
		position: relative;
		flex: 1;
		height: 12px;
		background: #eee;
		border-radius: 3px;
		cursor: pointer;
		box-sizing: border-box;
		border-top: solid 4px #fff;
		border-bottom: solid 4px #fff;
	}
	.combined-timeline-fill {
		position: absolute;
		left: 0;
		top: 0;
		height: 100%;
		background: #e0e1fe;
	}
	.combined-timeline-tick {
		position: absolute;
		top: 2px;
		width: 10px;
		height: 5px;
		transform: translate(-50%, -50%);
		background: rgb(73, 80, 246);
		pointer-events: none;
	}
	.combined-timeline-handle {
		position: absolute;
		top: 2px;
		width: 20px;
		height: 20px;
		border-radius: 10px;
		transform: translate(-50%, -50%);
		background: rgb(73, 80, 246);
		pointer-events: none;
	}
</style>
