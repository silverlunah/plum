<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, onDestroy } from 'svelte';
	import Player from 'rrweb-player';
	import 'rrweb-player/dist/style.css';
	import { LIVE_EMPTY_FRAME_HINT } from '$lib/copy/reports';

	// A growing array — new events are appended by the caller as they stream
	// in over the socket. liveMode lets rrweb-player start from zero events
	// (it otherwise requires a complete Meta+FullSnapshot pair up front).
	export let events = [];

	const META_EVENT_TYPE = 4;

	let viewport;
	let stage;
	let container;
	let player = null;
	let fedCount = 0;
	let nativeWidth = 0;
	let nativeHeight = 0;
	let resizeObserver;

	// rrweb-player renders at the recording's native resolution. Contain-fit it
	// inside the panel — the same sizing the replay player (RecordingPlayer)
	// gets from rrweb-player — so a run looks identical live or replayed. Re-run
	// on every resize.
	function updateScale() {
		if (!nativeWidth || !nativeHeight || !viewport) return;
		const vp = viewport.getBoundingClientRect();
		const scale = Math.min(vp.width / nativeWidth, vp.height / nativeHeight) || 0;
		stage.style.width = `${nativeWidth * scale}px`;
		stage.style.height = `${nativeHeight * scale}px`;
		container.style.transformOrigin = 'top left';
		container.style.transform = `scale(${scale})`;
	}

	// getMetaData() (called internally by rrweb-player's own controls on
	// construction) reads events[0].timestamp unconditionally, so the initial
	// batch must be passed in props rather than fed empty and via addEvent.
	function buildPlayer() {
		const rect = viewport.getBoundingClientRect();
		const meta = events.find((e) => e?.type === META_EVENT_TYPE)?.data ?? null;
		nativeWidth = meta?.width > 0 ? meta.width : rect.width;
		nativeHeight = meta?.height > 0 ? meta.height : rect.height;

		player = new Player({
			target: container,
			props: {
				events,
				liveMode: true,
				autoPlay: false,
				showController: false,
				width: nativeWidth,
				height: nativeHeight
			}
		});
		fedCount = events.length;
		player.getReplayer()?.startLive();
		updateScale();
	}

	// Feed only what's newly arrived since the last run of this block —
	// addEvent() is the incremental API, not a full-array replace.
	$: if (player && events.length > fedCount) {
		for (let i = fedCount; i < events.length; i++) player.addEvent(events[i]);
		fedCount = events.length;
	}

	onMount(() => {
		buildPlayer();
		// Observe the viewport, not the stage — the stage's size is what we set.
		resizeObserver = new ResizeObserver(updateScale);
		resizeObserver.observe(viewport);
	});
	onDestroy(() => {
		resizeObserver?.disconnect();
		try {
			player?.getReplayer()?.destroy();
		} catch {
			// already torn down
		}
	});
</script>

<div class="live-viewport" bind:this={viewport}>
	<div class="live-stage" bind:this={stage}>
		<div
			class="live-mount"
			style="--live-empty-hint: {JSON.stringify(LIVE_EMPTY_FRAME_HINT)}"
			bind:this={container}
		></div>
	</div>
</div>

<style>
	/* Fills the panel; the stage is sized in JS to a contain-fit of the recording,
	   centred on the dot-grid canvas — matching the replay player. */
	.live-viewport {
		flex: 1;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.live-stage {
		position: relative;
	}

	.live-mount {
		position: absolute;
		top: 0;
		left: 0;
	}

	/* Kept visually in step with the replay player — see RecordingPlayer's .player-mount. */
	.live-mount :global(.rr-player) {
		border-radius: 0 !important;
		box-shadow: none !important;
		background: transparent !important;
	}
	.live-mount :global(iframe) {
		border-radius: var(--radius-md);
	}
	.live-mount :global(.replayer-wrapper) {
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--bg-elevated);
	}
	/* Shows only before the browser navigates — the live counterpart to RecordingPlayer's replay hint. */
	.live-mount :global(.replayer-wrapper)::before {
		content: var(--live-empty-hint);
		position: absolute;
		inset: 0;
		z-index: -1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		line-height: 1.5;
		pointer-events: none;
	}
</style>
