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

	let viewport;
	let stage;
	let container;
	let player = null;
	let fedCount = 0;
	let nativeWidth = 0;
	let nativeHeight = 0;
	let resizeObserver;

	// rrweb-player renders at the recording's native resolution. Scale it to the
	// full panel width and anchor it to the top: the browser frame is shown at
	// true proportions (never zoomed or cropped), and any leftover space is a
	// single region below the page — not the symmetric top+bottom letterbox
	// bars a contain-fit leaves. Re-run on every resize.
	function updateScale() {
		if (!nativeWidth || !nativeHeight || !viewport) return;
		const vp = viewport.getBoundingClientRect();
		const scale = vp.width / nativeWidth || 0;
		stage.style.width = `${vp.width}px`;
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
		<div class="live-mount" bind:this={container}></div>
	</div>
</div>

<style>
	/* Fills the panel; the stage is sized in JS to the panel width at the
	   recording's true aspect ratio, pinned to the top. */
	.live-viewport {
		flex: 1;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		overflow: hidden;
	}

	.live-stage {
		position: relative;
		overflow: hidden;
	}

	.live-mount {
		position: absolute;
		top: 0;
		left: 0;
	}

	.live-mount :global(.rr-player) {
		border-radius: 0 !important;
		box-shadow: none !important;
	}
</style>
