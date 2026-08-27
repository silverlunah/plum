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
	import CodeViewer from '$lib/components/ui/CodeViewer.svelte';
	import StepKeyword from '$lib/components/ui/StepKeyword.svelte';
	import StepStatusIcon from '$lib/components/ui/StepStatusIcon.svelte';
	import {
		PLAYER_LOAD_ERROR,
		INSPECT_TOGGLE_LABEL,
		RESTART_LABEL,
		NO_ELEMENT_SELECTED,
		ELEMENT_ATTRIBUTES_LABEL,
		ELEMENT_SIZE_LABEL,
		recordingTabLabel
	} from '$lib/copy/reports';

	export let reportId;
	export let recordings = [];
	export let steps = [];
	export let inspecting = false;

	const MIN_PLAYER_WIDTH = 480;
	const MIN_PLAYER_HEIGHT = 320;
	const CONTROLLER_HEIGHT = 80;

	let stage;
	let container;
	let player = null;
	let loading = true;
	let loadError = false;
	let selectedElement = null;
	let hoverBox = null;
	let cleanupInspect = null;
	let currentStepIndex = -1;
	let stepTimestamps = [];

	// Recordings placed on one timeline so playback can auto-switch tabs — see computeRecordingSegments.
	let recordingsById = new Map();
	let eventsByRecordingId = new Map();
	let segments = [];
	let activeSegmentIndex = 0;
	$: activeRecording = recordingsById.get(segments[activeSegmentIndex]?.recordingId);

	// goto() offsets are relative to the recording's first event — bound to this
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

	// stepIndexOverride: the target ts is the NEXT step's marker, so deriving the
	// highlight from it would pick the wrong step (see jumpToStep).
	function seekToAbsolute(ts, autoplay, stepIndexOverride) {
		let targetIdx = segments.findIndex((s) => ts >= s.from && ts <= s.to);
		if (targetIdx === -1) targetIdx = segments.length - 1;
		if (targetIdx < 0) return;

		const { first, span } = segmentEventBounds(segments[targetIdx]);
		const localOffset = Math.min(Math.max(0, ts - first), span);
		const speed = player?.getReplayer?.()?.config.speed ?? 1;

		if (targetIdx === activeSegmentIndex) {
			player?.goto(localOffset, autoplay);
			if (stepIndexOverride !== undefined) currentStepIndex = stepIndexOverride;
		} else {
			activeSegmentIndex = targetIdx;
			buildPlayer({
				finished: false,
				timeOffset: localOffset,
				paused: !autoplay,
				speed,
				stepIndexOverride
			});
		}
	}

	function jumpToStep(i) {
		if (stepTimestamps[i] === undefined || !player) return;
		currentStepIndex = i;
		// Jump to the next marker (or end) — step i's own marker fires before its actions run.
		const nextTs = stepTimestamps[i + 1] ?? segments[segments.length - 1]?.to;
		if (nextTs === undefined) return;
		seekToAbsolute(nextTs, false, i); // paused, so a fast step isn't missed
	}

	function escapeAttr(v) {
		return v.replace(/"/g, '&quot;');
	}

	function shallowMarkup(el) {
		const tag = el.tagName.toLowerCase();
		const attrs = Array.from(el.attributes ?? [])
			.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
			.join('');
		const childCount = el.children.length;
		const text = childCount === 0 ? (el.textContent ?? '').trim() : '';
		const inner =
			childCount > 0
				? `\n  <!-- ${childCount} child element${childCount === 1 ? '' : 's'} -->\n`
				: text
					? `\n  ${text.slice(0, 200)}\n`
					: '';
		return `<${tag}${attrs}>${inner}</${tag}>`;
	}

	function describeElement(el) {
		const rect = el.getBoundingClientRect();
		return {
			markup: shallowMarkup(el),
			attributes: Array.from(el.attributes ?? []).map((a) => ({ name: a.name, value: a.value })),
			box: { width: Math.round(rect.width), height: Math.round(rect.height) }
		};
	}

	function setupInspectListeners() {
		const replayer = player?.getReplayer?.();
		const iframe = replayer?.iframe;
		const doc = iframe?.contentDocument;
		if (!iframe || !doc) return;

		const onMove = (e) => {
			const target = e.target;
			if (!target || target === doc.documentElement) {
				hoverBox = null;
				return;
			}
			const rect = target.getBoundingClientRect();
			const iframeRect = iframe.getBoundingClientRect();
			const stageRect = stage.getBoundingClientRect();
			// rrweb-player scales the iframe to fit — clientWidth/Height are the
			// pre-scale box, getBoundingClientRect the post-scale one; ratio = scale.
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

		cleanupInspect = () => {
			doc.removeEventListener('mousemove', onMove);
			doc.removeEventListener('click', onClick, true);
			doc.removeEventListener('mouseleave', onLeave);
			doc.removeEventListener('keydown', onKeydown);
			hoverBox = null;
		};
	}

	function teardownInspectListeners() {
		if (cleanupInspect) {
			cleanupInspect();
			cleanupInspect = null;
		}
	}

	// Rebuild since rrweb-player's canvas won't reflow to the resized stage on its own.
	async function toggleInspect() {
		inspecting = !inspecting;
		const resumeState = currentPlaybackState();
		if (resumeState && inspecting) resumeState.paused = true;
		if (!inspecting) teardownInspectListeners();
		await tick();
		buildPlayer(resumeState);
	}

	function togglePlayPause() {
		const replayer = player?.getReplayer?.();
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

	// Mutating rrweb's play/pause button directly duplicates the icon — overlay our own instead.
	function setupFinishRestart() {
		const replayer = player?.getReplayer?.();
		const playPauseBtn = container?.querySelector('.rr-controller__btns button');
		if (!replayer || !playPauseBtn) return;

		replayer.on('finish', () => {
			if (activeSegmentIndex < segments.length - 1) {
				const speed = replayer.config.speed;
				activeSegmentIndex += 1;
				const nextSeg = segments[activeSegmentIndex];
				const { first } = segmentEventBounds(nextSeg);
				const timeOffset = Math.max(0, nextSeg.from - first);
				buildPlayer({ finished: false, timeOffset, paused: false, speed });
				return;
			}
			const btnRect = playPauseBtn.getBoundingClientRect();
			const stageRect = stage.getBoundingClientRect();
			restartBoxStyle = `top: ${btnRect.top - stageRect.top}px; left: ${btnRect.left - stageRect.left}px; width: ${btnRect.width}px; height: ${btnRect.height}px;`;
			finished = true;
		});
		replayer.on('start', () => (finished = false));
		replayer.on('resume', () => (finished = false));
	}

	function restartPlayback() {
		finished = false;
		if (activeSegmentIndex !== 0) {
			const speed = player?.getReplayer?.()?.config.speed ?? 1;
			activeSegmentIndex = 0;
			buildPlayer({ finished: false, timeOffset: 0, paused: false, speed });
		} else {
			player?.goto(0, true);
		}
	}

	function currentPlaybackState() {
		const replayer = player?.getReplayer?.();
		if (!replayer) return null;
		if (finished) return { finished: true, speed: replayer.config.speed };
		return {
			finished: false,
			timeOffset: replayer.getCurrentTime(),
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
		const stageRect = stage.getBoundingClientRect();
		const width = Math.max(MIN_PLAYER_WIDTH, Math.floor(stageRect.width));
		// Subtract rrweb's built-in controller height or it overflows the stage.
		const height = Math.max(MIN_PLAYER_HEIGHT, Math.floor(stageRect.height) - CONTROLLER_HEIGHT);

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

		// A recording with more than one FullSnapshot (an in-page navigation, or a tab
		// that was still on about:blank when it opened) breaks rrweb-player's paused
		// goto() if it has to fast-forward across more than one — feed it only from the
		// last FullSnapshot at or before the target so it never has to.
		let headIdx = 0;
		for (let i = 0; i < tailEvents.length; i++) {
			if (tailEvents[i].timestamp > targetAbs) break;
			if (tailEvents[i].type === 2) headIdx = i > 0 && tailEvents[i - 1].type === 4 ? i - 1 : i;
		}
		const events = tailEvents.slice(headIdx);
		const first = events[0]?.timestamp ?? recordingFirst;
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
			finished = true;
			// Recompute the restart button position — it moved under this rebuild.
			requestAnimationFrame(() => {
				if (!container) return;
				const btn = container.querySelector('.rr-controller__btns button');
				if (!btn) return;
				const btnRect = btn.getBoundingClientRect();
				const stageRect2 = stage.getBoundingClientRect();
				restartBoxStyle = `top: ${btnRect.top - stageRect2.top}px; left: ${btnRect.left - stageRect2.left}px; width: ${btnRect.width}px; height: ${btnRect.height}px;`;
			});
		} else {
			player.setSpeed(resumeState.speed);
			player.goto(timeOffset, !resumeState.paused);
		}

		// Re-attach to the fresh iframe; wait a frame for a paused goto() to settle first.
		if (inspecting) {
			requestAnimationFrame(() => {
				teardownInspectListeners();
				setupInspectListeners();
			});
		}
	}

	onMount(async () => {
		recordingsById = new Map(recordings.map((r) => [r.id, r]));

		try {
			const results = await Promise.all(
				recordings.map((r) => fetchRecordingEvents(reportId, r.id))
			);
			// Only multi-tab scenarios need this — a normal single-tab recording's own
			// navigations (e.g. login page -> products page) must stay intact.
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
	});

	onDestroy(destroyPlayer);
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="recording-player">
	{#if steps.length > 0}
		<aside class="steps-rail">
			<div class="steps-rail-header">Steps</div>
			<ol class="steps-list">
				{#each steps as step, i}
					<li>
						<button
							class="rail-step"
							class:rail-step-active={i === currentStepIndex}
							disabled={stepTimestamps[i] === undefined}
							on:click={() => jumpToStep(i)}
						>
							<StepStatusIcon status={step.status} />
							<span class="rail-step-text">
								<StepKeyword keyword={step.keyword} />
								<span>{step.name}</span>
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</aside>
	{/if}

	<div class="player-stage" bind:this={stage}>
		<div
			class="player-mount"
			class:player-mount-multi={segments.length > 1}
			bind:this={container}
		></div>
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
		<aside class="inspector-panel">
			<div class="inspector-header">
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
				</svg>
				Inspector
			</div>
			{#if selectedElement}
				<CodeViewer code={selectedElement.markup} />
				<div class="inspector-section">
					<span class="inspector-section-label">{ELEMENT_SIZE_LABEL}</span>
					<span class="inspector-size"
						>{selectedElement.box.width} × {selectedElement.box.height}</span
					>
				</div>
				{#if selectedElement.attributes.length > 0}
					<div class="inspector-section">
						<span class="inspector-section-label">{ELEMENT_ATTRIBUTES_LABEL}</span>
					</div>
					<dl class="inspector-attrs">
						{#each selectedElement.attributes as attr}
							<div class="inspector-attr-row">
								<dt>{attr.name}</dt>
								<dd>{attr.value}</dd>
							</div>
						{/each}
					</dl>
				{/if}
			{:else}
				<div class="inspector-empty">{NO_ELEMENT_SELECTED}</div>
			{/if}
		</aside>
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

	/* ── Steps rail ── */
	.steps-rail {
		flex-shrink: 0;
		width: 240px;
		display: flex;
		flex-direction: column;
		background: var(--bg-elevated);
		overflow-y: auto;
	}

	.steps-rail-header {
		flex-shrink: 0;
		padding: 0.7rem 0.9rem 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.steps-list {
		list-style: none;
		margin: 0;
		padding: 0 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.rail-step {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.35;
		text-align: left;
		color: var(--text-muted);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-out);
	}
	.rail-step:hover:not(:disabled) {
		background: var(--bg-subtle);
	}
	.rail-step:disabled {
		cursor: default;
	}

	.rail-step-text {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
		word-break: break-word;
	}

	.rail-step-active {
		background: var(--accent-soft);
		color: var(--text);
		font-weight: 500;
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
		background: var(--bg-subtle);
	}

	.player-mount {
		display: flex;
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

	/* Multi-tab only: the mounted player holds its recording's full history, not just
	   this segment's slice — rrweb's scrubber isn't segment-aware, so dragging it can
	   land before this segment's start. Disable it; the steps rail navigates correctly. */
	.player-mount-multi :global(.rr-progress) {
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

	/* ── Inspector ── */
	.inspector-panel {
		flex-shrink: 0;
		width: 280px;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.75rem 0.9rem 0.9rem;
		background: var(--bg-elevated);
		overflow-y: auto;
	}
	/* A long attribute list scrolls the panel, doesn't squeeze the code viewer. */
	.inspector-panel > * {
		flex-shrink: 0;
	}
	.inspector-panel :global(.code-viewer) {
		flex-shrink: 0;
	}

	.inspector-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding-bottom: 0.5rem;
		margin-bottom: 0.1rem;
		border-bottom: 1px solid var(--border);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.inspector-empty {
		color: var(--text-muted);
		font-size: 0.8rem;
		padding: 1rem 0.1rem;
		line-height: 1.5;
	}

	.inspector-section {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.inspector-section-label {
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.inspector-size {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: var(--text);
	}

	.inspector-attrs {
		margin: 0;
		display: flex;
		flex-direction: column;
	}
	.inspector-attr-row {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.35rem 0;
		border-top: 1px solid var(--border);
	}
	.inspector-attr-row dt {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: var(--accent);
	}
	.inspector-attr-row dd {
		margin: 0;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
		word-break: break-all;
	}
</style>
