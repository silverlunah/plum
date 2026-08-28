<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import Player from 'rrweb-player';
	import 'rrweb-player/dist/style.css';
	import { fetchRecordingEvents } from '$lib/api/reports';
	import { computeRecordingSegments } from '$lib/utils/format';
	import { describeElement } from '$lib/utils/inspectElement';
	import StepsRail from './StepsRail.svelte';
	import MultiTabTimeline from './MultiTabTimeline.svelte';
	import ElementInspector from './ElementInspector.svelte';
	import {
		PLAYER_LOAD_ERROR,
		INSPECT_TOGGLE_LABEL,
		RESTART_LABEL,
		recordingTabLabel
	} from '$lib/copy/reports';

	export let reportId;
	export let recordings = [];
	export let steps = [];
	export let inspecting = false;

	const MIN_PLAYER_WIDTH = 480;
	const MIN_PLAYER_HEIGHT = 320;
	const CONTROLLER_HEIGHT = 80;
	// Covers rrweb's 50ms 'finish' scheduling delay after a paused seek, so it's
	// never misread as reaching a natural finish.
	const FINISH_SUPPRESS_MS = 150;
	// Player would otherwise exactly fill .player-stage, leaving the button row
	// flush against its edge — shrinks it so centering leaves a margin.
	const STAGE_BREATHING_ROOM = 24;

	let stage;
	let container;
	let player = null;
	let loading = true;
	let loadError = false;
	let selectedElement = null;
	let hoverBox = null;
	let cleanupInspect = null;
	let inspectAttachedDoc = null;
	let inspectWatchRaf = null;
	let currentStepIndex = -1;
	let stepTimestamps = [];

	// Placed on one timeline so playback can auto-switch tabs — see computeRecordingSegments.
	let recordingsById = new Map();
	let eventsByRecordingId = new Map();
	let segments = [];
	let activeSegmentIndex = 0;
	$: activeRecording = recordingsById.get(segments[activeSegmentIndex]?.recordingId);

	// buildPlayer's mounted slice can start later than the segment's own `from`
	// (see its headIdx search) — this is that slice's real local-zero.
	// seekToAbsolute needs it to know whether an in-place goto() can reach a target.
	let mountedFirst = 0;

	// rrweb's own timeline resets per segment — this tracks absolute position
	// continuously across every rebuild, feeding MultiTabTimeline (multi-tab
	// only; single-tab's one player already has a correct native timeline).
	let livePosition = 0;
	let livePositionRaf = null;
	function tickLivePosition() {
		// Skip while finished: the finish handler snaps livePosition to overallTo
		// (endedAt can sit past the last real event) — polling here would
		// immediately overwrite that.
		const replayer = currentReplayer();
		if (replayer && !finished) livePosition = mountedFirst + replayer.getCurrentTime();
		livePositionRaf = requestAnimationFrame(tickLivePosition);
	}
	$: overallFrom = segments[0]?.from ?? 0;
	$: overallTo = segments[segments.length - 1]?.to ?? 0;

	function currentReplayer() {
		return player?.getReplayer?.();
	}

	// goto() offsets are relative to a recording's first event — bounded to this
	// segment's own slice so a repeat appearance doesn't land in an earlier one.
	function segmentEventBounds(seg) {
		const events = eventsByRecordingId.get(seg?.recordingId) ?? [];
		if (events.length === 0) return { first: 0, span: 0 };
		const first = events[0].timestamp;
		const upperBound = seg?.to ?? Infinity;
		let last = first;
		for (const e of events) {
			if (e.timestamp > upperBound) break;
			last = e.timestamp;
		}
		return { first, span: Math.max(0, last - first) };
	}

	function stepIndexAtAbsolute(ts) {
		let idx = -1;
		for (let i = 0; i < stepTimestamps.length; i++) {
			if (stepTimestamps[i] > ts) break;
			idx = i;
		}
		return idx;
	}

	// ts is the next step's marker, so deriving the highlight from it would pick
	// the wrong step — see jumpToStep.
	function seekToAbsolute(ts, autoplay, stepIndexOverride) {
		let targetIdx = segments.findIndex((s) => ts >= s.from && ts <= s.to);
		if (targetIdx === -1) targetIdx = segments.length - 1;
		if (targetIdx < 0) return;

		const { first, span } = segmentEventBounds(segments[targetIdx]);
		const recordingOffset = Math.min(Math.max(0, ts - first), span);
		const speed = currentReplayer()?.config.speed ?? 1;

		// An in-place goto() only works if the mounted slice already covers `ts`
		// — e.g. after toggling Inspect there may be nothing loaded to render.
		// Rebuild instead so the right FullSnapshot gets loaded again.
		if (targetIdx === activeSegmentIndex && ts >= mountedFirst) {
			if (!autoplay) suppressFinishUntil = Date.now() + FINISH_SUPPRESS_MS;
			player?.goto(ts - mountedFirst, autoplay);
			if (stepIndexOverride !== undefined) currentStepIndex = stepIndexOverride;
			// goto() can cross a mid-stream FullSnapshot (e.g. a tab navigating off
			// about:blank) and silently reset the iframe document — re-attach.
			if (inspecting) {
				teardownInspectListeners();
				setupInspectListeners();
				startInspectWatch();
			}
		} else {
			activeSegmentIndex = targetIdx;
			buildPlayer({
				finished: false,
				timeOffset: recordingOffset,
				paused: !autoplay,
				speed,
				stepIndexOverride
			});
		}
	}

	function jumpToStep(i) {
		if (stepTimestamps[i] === undefined || !player) return;
		currentStepIndex = i;
		// Jump to the next marker — step i's own marker fires before its actions run.
		// The last step has none: use the segment's real last event, not its `to`
		// boundary (can sit past it) — landing at/past the real end reads as a
		// natural finish instead of a paused seek (see suppressFinishUntil).
		let nextTs = stepTimestamps[i + 1];
		if (nextTs === undefined) {
			const { first, span } = segmentEventBounds(segments[segments.length - 1]);
			nextTs = first + Math.max(0, span - 1);
		}
		if (nextTs === undefined) return;
		seekToAbsolute(nextTs, false, i);
	}

	function setupInspectListeners() {
		const replayer = currentReplayer();
		const iframe = replayer?.iframe;
		const doc = iframe?.contentDocument;
		if (!iframe || !doc) return;
		inspectAttachedDoc = doc;

		const onMove = (e) => {
			const target = e.target;
			if (!target || target === doc.documentElement) {
				hoverBox = null;
				return;
			}
			const rect = target.getBoundingClientRect();
			const iframeRect = iframe.getBoundingClientRect();
			const stageRect = stage.getBoundingClientRect();
			// rrweb-player scales the iframe to fit — clientWidth/Height are
			// pre-scale, getBoundingClientRect post-scale; ratio = scale.
			const scaleX = iframeRect.width / (iframe.clientWidth || 1);
			const scaleY = iframeRect.height / (iframe.clientHeight || 1);
			// Relative to .player-stage so its overflow:hidden clips the highlight.
			hoverBox = {
				top: iframeRect.top + rect.top * scaleY - stageRect.top,
				left: iframeRect.left + rect.left * scaleX - stageRect.left,
				width: rect.width * scaleX,
				height: rect.height * scaleY
			};
		};
		const onClick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			selectedElement = describeElement(e.target);
		};
		const onLeave = () => {
			hoverBox = null;
		};
		// Escape fires here, not the outer window — the iframe is its own document.
		const onKeydown = (e) => {
			if (e.key === 'Escape') toggleInspect();
		};

		doc.addEventListener('mousemove', onMove);
		doc.addEventListener('click', onClick, true);
		doc.addEventListener('mouseleave', onLeave);
		doc.addEventListener('keydown', onKeydown);
		// rrweb can rebuild the document in place (document.open()/write()) without
		// the contentDocument reference changing — watchInspectDoc's reference
		// check alone would miss that a fresh documentElement wiped this marker.
		try {
			doc.documentElement.dataset.plumInspectWired = '1';
		} catch {
			// cross-origin/detached doc — inspect wiring is best-effort
		}

		cleanupInspect = () => {
			doc.removeEventListener('mousemove', onMove);
			doc.removeEventListener('click', onClick, true);
			doc.removeEventListener('mouseleave', onLeave);
			doc.removeEventListener('keydown', onKeydown);
			hoverBox = null;
		};
	}

	function teardownInspectListeners() {
		inspectAttachedDoc = null;
		if (cleanupInspect) {
			cleanupInspect();
			cleanupInspect = null;
		}
	}

	function stopInspectWatch() {
		if (inspectWatchRaf !== null) {
			cancelAnimationFrame(inspectWatchRaf);
			inspectWatchRaf = null;
		}
	}

	// Safety net alongside the immediate re-attach in buildPlayer: if the
	// iframe's Document ever ends up different from the one our listeners
	// are on (e.g. rrweb replacing it for a later FullSnapshot), self-heal
	// on the next frame rather than leaving Inspect silently unresponsive
	// until something else triggers a rebuild.
	function watchInspectDoc() {
		if (!inspecting) {
			inspectWatchRaf = null;
			return;
		}
		const doc = currentReplayer()?.iframe?.contentDocument;
		const stillWired = doc?.documentElement?.dataset.plumInspectWired === '1';
		if (doc && (doc !== inspectAttachedDoc || !stillWired)) {
			teardownInspectListeners();
			setupInspectListeners();
		}
		inspectWatchRaf = requestAnimationFrame(watchInspectDoc);
	}

	function startInspectWatch() {
		if (inspectWatchRaf === null) inspectWatchRaf = requestAnimationFrame(watchInspectDoc);
	}

	// Rebuild since rrweb-player's canvas won't reflow to the resized stage on its own.
	async function toggleInspect() {
		inspecting = !inspecting;
		const resumeState = currentPlaybackState();
		if (resumeState && inspecting) resumeState.paused = true;
		// jumpToStep pauses exactly at the NEXT marker to show step i's result —
		// recomputing the highlight from that boundary would read it as step i+1
		// having started. Preserve the already-correct index instead.
		if (resumeState) resumeState.stepIndexOverride = currentStepIndex;
		if (!inspecting) {
			teardownInspectListeners();
			stopInspectWatch();
		}
		await tick();
		buildPlayer(resumeState);
	}

	function togglePlayPause() {
		const replayer = currentReplayer();
		if (!replayer) return;
		if (replayer.service.state.matches('paused')) {
			player.play();
		} else {
			player.pause();
		}
	}

	// Escape exits inspect mode first — the parent's handler checks `inspecting` (bound) before closing.
	function handleWindowKeydown(e) {
		if (e.key === 'Escape' && inspecting) {
			toggleInspect();
			return;
		}
		if (e.key === ' ' && !inspecting) {
			e.preventDefault();
			togglePlayPause();
		}
	}

	let finished = false;
	let restartBoxStyle = '';

	// rrweb schedules 'finish' 50ms after casting the array's last event — even
	// during a paused seek's sync catch-up. Only real autoplay should trigger
	// the auto-advance-to-next-tab below.
	let awaitingNaturalFinish = false;
	// Set right before any deliberate paused seek — see FINISH_SUPPRESS_MS.
	let suppressFinishUntil = 0;

	// rrweb's 50ms finish timeout isn't cancelled by destroying the replayer —
	// a short segment can be torn down before its own stale finish fires,
	// double-advancing past whatever's current. Each build gets a generation;
	// a finish only acts if its replayer is still the live one.
	let buildGeneration = 0;

	function playPauseButton() {
		return container?.querySelector('.rr-controller__btns button');
	}

	function positionRestartButton(btn) {
		if (!btn) return;
		const btnRect = btn.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		restartBoxStyle = `top: ${btnRect.top - stageRect.top}px; left: ${btnRect.left - stageRect.left}px; width: ${btnRect.width}px; height: ${btnRect.height}px;`;
	}

	// Mutating rrweb's play/pause button directly duplicates the icon — overlay our own instead.
	function setupFinishRestart() {
		const replayer = currentReplayer();
		const playPauseBtn = playPauseButton();
		if (!replayer || !playPauseBtn) return;
		const myGeneration = buildGeneration;

		replayer.on('finish', () => {
			if (buildGeneration !== myGeneration) return;
			if (Date.now() < suppressFinishUntil) return;
			if (!awaitingNaturalFinish) return;
			if (activeSegmentIndex < segments.length - 1) {
				const speed = replayer.config.speed;
				activeSegmentIndex += 1;
				const nextSeg = segments[activeSegmentIndex];
				const { first } = segmentEventBounds(nextSeg);
				const timeOffset = Math.max(0, nextSeg.from - first);
				buildPlayer({ finished: false, timeOffset, paused: false, speed });
				return;
			}
			positionRestartButton(playPauseBtn);
			finished = true;
			// endedAt can sit past the last real event, so livePosition otherwise
			// stalls short of overallTo on natural finish.
			livePosition = overallTo;
		});
		// Derived from the replayer's own lifecycle, not our call sites — the
		// native play/pause button calls rrweb's own toggle() directly,
		// bypassing togglePlayPause(). A paused seek still nets out false:
		// internally it's play() (emits start) then an explicit pause (emits pause).
		replayer.on('start', () => {
			finished = false;
			awaitingNaturalFinish = true;
		});
		replayer.on('resume', () => {
			finished = false;
			awaitingNaturalFinish = true;
		});
		replayer.on('pause', () => {
			awaitingNaturalFinish = false;
		});
	}

	function restartPlayback() {
		finished = false;
		if (activeSegmentIndex !== 0) {
			const speed = currentReplayer()?.config.speed ?? 1;
			activeSegmentIndex = 0;
			buildPlayer({ finished: false, timeOffset: 0, paused: false, speed });
		} else {
			player?.goto(0, true);
		}
	}

	function currentPlaybackState() {
		const replayer = currentReplayer();
		if (!replayer) return null;
		if (finished) return { finished: true, speed: replayer.config.speed };
		// getCurrentTime() is relative to the mounted slice's first event, not
		// the recording's true first — re-anchor to what buildPlayer expects,
		// same as seekToAbsolute's mountedFirst.
		const { first: recordingFirst } = segmentEventBounds(segments[activeSegmentIndex]);
		return {
			finished: false,
			timeOffset: mountedFirst + replayer.getCurrentTime() - recordingFirst,
			paused: replayer.service.state.matches('paused'),
			speed: replayer.config.speed
		};
	}

	function destroyPlayer() {
		teardownInspectListeners();
		if (player) {
			try {
				player.$destroy();
			} catch {
				// already torn down
			}
			player = null;
		}
	}

	// rrweb-player's size is fixed at construction — rebuild to re-measure the stage.
	function buildPlayer(resumeState = null) {
		buildGeneration += 1;
		const stageRect = stage.getBoundingClientRect();
		const width = Math.max(MIN_PLAYER_WIDTH, Math.floor(stageRect.width));
		// Subtract rrweb's controller height — MultiTabTimeline overlays into
		// that same reserved strip, no extra space needed.
		const height = Math.max(
			MIN_PLAYER_HEIGHT,
			Math.floor(stageRect.height) - CONTROLLER_HEIGHT - STAGE_BREATHING_ROOM
		);

		if (player) {
			try {
				player.$destroy();
			} catch {
				// already torn down
			}
			player = null;
		}
		container.replaceChildren();

		const seg = segments[activeSegmentIndex];
		const fullEvents = eventsByRecordingId.get(seg?.recordingId) ?? [];
		// Truncate to this segment's own end so 'finish' fires at the real hand-off point.
		const upperBound = seg?.to ?? Infinity;
		const tailEvents = fullEvents.filter((e) => e.timestamp <= upperBound);
		const recordingFirst = fullEvents[0]?.timestamp ?? 0;
		const targetAbs = resumeState?.finished
			? upperBound
			: recordingFirst + (resumeState?.timeOffset ?? 0);

		// A recording with >1 FullSnapshot (an in-page navigation, or a tab still
		// on about:blank when opened) breaks a paused goto() if it has to
		// fast-forward across more than one — feed only from the last snapshot
		// at or before the target.
		let headIdx = 0;
		for (let i = 0; i < tailEvents.length; i++) {
			if (tailEvents[i].timestamp > targetAbs) break;
			if (tailEvents[i].type === 2) headIdx = i > 0 && tailEvents[i - 1].type === 4 ? i - 1 : i;
		}
		// headIdx can reach into an earlier segment's span, dragging its step
		// markers along as stray ticks on rrweb's timeline. Custom events never
		// affect playback (sync catch-up skips them), so dropping ones before
		// this segment only removes the stray ticks.
		const events = tailEvents.slice(headIdx).filter((e) => e.type !== 5 || e.timestamp >= seg.from);
		const first = events[0]?.timestamp ?? recordingFirst;
		mountedFirst = first;
		const timeOffset = Math.max(0, targetAbs - first);

		player = new Player({
			target: container,
			props: {
				events,
				autoPlay: false,
				showController: true,
				speedOption: [0.5, 1, 2],
				speed: 1,
				width,
				height
			}
		});
		if (resumeState?.stepIndexOverride !== undefined) {
			currentStepIndex = resumeState.stepIndexOverride;
		} else {
			currentStepIndex = stepIndexAtAbsolute(targetAbs);
		}
		player.addEventListener('custom-event', (event) => {
			if (event?.data?.tag === 'step') {
				currentStepIndex += 1;
			}
		});
		setupFinishRestart();

		if (!resumeState) {
			// setSpeed(1) doesn't sync the controller's displayed speed — click the button instead.
			requestAnimationFrame(() => {
				if (!container) return;
				const oneXBtn = Array.from(container.querySelectorAll('.rr-controller__btns button')).find(
					(b) => b.textContent.trim() === '1x'
				);
				oneXBtn?.click();
			});
			player.play();
		} else if (resumeState.finished) {
			player.setSpeed(resumeState.speed);
			// A fresh Player starts at its first frame — without this explicit seek,
			// rebuilding here (e.g. toggling Inspect after a natural finish) would
			// show a blank first frame instead of staying on the last one.
			suppressFinishUntil = Date.now() + FINISH_SUPPRESS_MS;
			player.goto(timeOffset, false);
			finished = true;
			livePosition = overallTo;
			// Restart button moved under this rebuild — recompute its position.
			requestAnimationFrame(() => positionRestartButton(playPauseButton()));
		} else {
			player.setSpeed(resumeState.speed);
			if (resumeState.paused) suppressFinishUntil = Date.now() + FINISH_SUPPRESS_MS;
			player.goto(timeOffset, !resumeState.paused);
		}

		// Re-attach to the fresh iframe. watchInspectDoc (started below) keeps
		// this correct afterward too, in case the iframe's Document changes
		// again past this point.
		if (inspecting) {
			teardownInspectListeners();
			setupInspectListeners();
			startInspectWatch();
		}
	}

	onMount(async () => {
		recordingsById = new Map(recordings.map((r) => [r.id, r]));

		try {
			const results = await Promise.all(
				recordings.map((r) => fetchRecordingEvents(reportId, r.id))
			);
			recordings.forEach((r, i) => eventsByRecordingId.set(r.id, results[i] ?? []));
		} catch {
			loadError = true;
			loading = false;
			return;
		}
		if ([...eventsByRecordingId.values()].every((events) => events.length === 0)) {
			loadError = true;
			loading = false;
			return;
		}

		const computed = computeRecordingSegments(recordings);
		// Older recordings lack startedAt/endedAt — fall back to just the first tab.
		segments =
			computed.length > 0
				? computed
				: recordings[0]
					? [{ recordingId: recordings[0].id, from: 0, to: 0 }]
					: [];

		// Step markers are always written to the main tab (see markStepStart in browser.ts).
		const mainRecording = recordings.find((r) => r.tabIndex === 0) ?? recordings[0];
		const mainEvents = eventsByRecordingId.get(mainRecording?.id) ?? [];
		stepTimestamps = mainEvents
			.filter((e) => e.type === 5 && e.data?.tag === 'step')
			.map((e) => e.timestamp);

		buildPlayer();
		loading = false;
		livePositionRaf = requestAnimationFrame(tickLivePosition);
	});

	onDestroy(() => {
		if (livePositionRaf !== null) cancelAnimationFrame(livePositionRaf);
		stopInspectWatch();
		destroyPlayer();
	});
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="recording-player">
	{#if steps.length > 0}
		<StepsRail {steps} {stepTimestamps} {currentStepIndex} on:jump={(e) => jumpToStep(e.detail)} />
	{/if}

	<div class="player-stage" bind:this={stage}>
		<div class="player-column">
			<div
				class="player-mount"
				class:player-mount-multi={segments.length > 1}
				bind:this={container}
			></div>
			{#if segments.length > 1}
				<MultiTabTimeline
					from={overallFrom}
					to={overallTo}
					position={livePosition}
					{stepTimestamps}
					on:seek={(e) => seekToAbsolute(e.detail, false)}
				/>
			{/if}
		</div>
		{#if segments.length > 1 && activeRecording}
			<div class="active-tab-badge">{recordingTabLabel(activeRecording.tabIndex)}</div>
		{/if}
		{#if loading}
			<div class="player-status">
				<div class="loading-dots"><span></span><span></span><span></span></div>
			</div>
		{:else if loadError}
			<div class="player-status">{PLAYER_LOAD_ERROR}</div>
		{/if}
		{#if hoverBox}
			<div
				class="inspect-highlight"
				style="top: {hoverBox.top}px; left: {hoverBox.left}px; width: {hoverBox.width}px; height: {hoverBox.height}px;"
			></div>
		{/if}
		{#if finished}
			<button
				class="restart-overlay-btn"
				style={restartBoxStyle}
				on:click={restartPlayback}
				aria-label={RESTART_LABEL}
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="1 4 1 10 7 10" />
					<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
				</svg>
			</button>
		{/if}

		<button
			class="inspect-fab"
			class:inspect-fab-active={inspecting}
			on:click={toggleInspect}
			disabled={loading || loadError}
			title={INSPECT_TOGGLE_LABEL}
			aria-label={INSPECT_TOGGLE_LABEL}
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
			</svg>
		</button>
	</div>

	{#if inspecting}
		<ElementInspector {selectedElement} />
	{/if}
</div>

<style>
	.recording-player {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 1px;
		background: var(--border);
		overflow: hidden;
	}

	/* ── Stage ── */
	.player-stage {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Matches the constructed player's own white chrome so
		   STAGE_BREATHING_ROOM's margin doesn't look like an unstyled gap. */
		background: var(--bg-elevated);
	}

	/* Shrink-wraps to .player-mount's own box so MultiTabTimeline can be
	   positioned absolutely against it, not the wider stage. */
	.player-column {
		position: relative;
		display: inline-flex;
	}

	.player-mount {
		display: flex;
	}

	/* rrweb's .rr-player/.rr-controller ship a rounded corner + drop shadow,
	   invisible only while the player filled its container edge-to-edge.
	   STAGE_BREATHING_ROOM now leaves a margin that reveals both as a smudge. */
	.player-mount :global(.rr-player) {
		border-radius: 0 !important;
		box-shadow: none !important;
	}
	.player-mount :global(.rr-controller) {
		border-radius: 0 !important;
	}

	/* rrweb sets pointer-events:none inline, blocking scroll — safe to override, iframe is sandboxed. */
	.player-mount :global(iframe) {
		pointer-events: auto !important;
	}

	/* "Skip inactive" is a dead control here — hide it. */
	.player-mount :global(.switch) {
		display: none !important;
	}
	.player-mount :global(.rr-controller__btns) {
		gap: 0.5rem;
	}

	/* Multi-tab only: rrweb's timeline can't span multiple tabs (see
	   livePosition above) — visibility (not display) keeps its layout space
	   reserved for MultiTabTimeline to overlay into. */
	.player-mount-multi :global(.rr-timeline) {
		visibility: hidden !important;
		pointer-events: none !important;
	}

	.player-status {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.loading-dots {
		display: flex;
		gap: 0.3rem;
	}
	.loading-dots span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-muted);
		animation: dotPulse 1.1s ease-in-out infinite;
	}
	.loading-dots span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.loading-dots span:nth-child(3) {
		animation-delay: 0.3s;
	}

	.active-tab-badge {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		padding: 0.3rem 0.6rem;
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(6px);
		border-radius: var(--radius-pill);
		color: #fff;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
	}

	.inspect-highlight {
		position: absolute;
		pointer-events: none;
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		border: 1.5px solid var(--accent);
		border-radius: 2px;
		z-index: 10000;
	}

	.restart-overlay-btn {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
		border: none;
		border-radius: 50%;
		color: #11103e;
		cursor: pointer;
		z-index: 10001;
	}
	.restart-overlay-btn:hover {
		background: #f0f0f5;
	}

	.inspect-fab {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(6px);
		border: none;
		border-radius: 50%;
		color: #fff;
		cursor: pointer;
		opacity: 0.7;
		transition:
			opacity var(--duration-fast) var(--ease-out),
			background var(--duration-fast) var(--ease-out);
	}
	.inspect-fab:hover:not(:disabled) {
		opacity: 1;
	}
	.inspect-fab:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.inspect-fab-active {
		background: var(--accent);
		opacity: 1;
	}
</style>
