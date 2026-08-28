<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, onDestroy } from 'svelte';
	import Player from 'rrweb-player';
	import 'rrweb-player/dist/style.css';

	// A growing array — new events are appended by the caller as they stream
	// in over the socket. liveMode lets rrweb-player start from zero events
	// (it otherwise requires a complete Meta+FullSnapshot pair up front).
	export let events = [];

	const META_EVENT_TYPE = 4;

	let stage;
	let container;
	let player = null;
	let fedCount = 0;
	let nativeWidth = 0;
	let nativeHeight = 0;
	let resizeObserver;

	// rrweb-player renders at the recording's native resolution — scale-and-crop
	// it to fill the stage (object-fit: cover) instead of letterboxing. Re-run on
	// every stage resize, since the panel's own layout (tab strips appearing,
	// window resize) can still shift its size after the player is built.
	function updateScale() {
		if (!nativeWidth || !nativeHeight) return;
		const rect = stage.getBoundingClientRect();
		const scale = Math.max(rect.width / nativeWidth, rect.height / nativeHeight);
		container.style.transform = `scale(${scale})`;
	}

	// getMetaData() (called internally by rrweb-player's own controls on
	// construction) reads events[0].timestamp unconditionally, so the initial
	// batch must be passed in props rather than fed empty and via addEvent.
	function buildPlayer() {
		const rect = stage.getBoundingClientRect();
		const meta = events[0]?.type === META_EVENT_TYPE ? events[0].data : null;
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
		resizeObserver = new ResizeObserver(updateScale);
		resizeObserver.observe(stage);
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

<div class="live-stage" bind:this={stage}>
	<div class="live-mount" bind:this={container}></div>
</div>

<style>
	.live-stage {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-subtle);
		overflow: hidden;
	}

	.live-mount {
		display: flex;
	}

	/* Sandboxed iframe (no allow-scripts/forms/top-navigation) — safe to always
	   allow pointer interaction so a taller live page can still be scrolled. */
	.live-mount :global(iframe) {
		pointer-events: auto !important;
	}
</style>
