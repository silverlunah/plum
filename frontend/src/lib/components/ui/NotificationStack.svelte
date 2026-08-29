<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { notifications, dismissNotification } from '$lib/stores/notifications';
	import { replayVideoJob, cancelReplayVideo, dismissReplayVideo } from '$lib/stores/replayVideo';
	import { CANCEL_LABEL } from '$lib/copy/common';
	import {
		DISMISS_LABEL,
		VIDEO_TASK_RENDERING,
		VIDEO_TASK_DONE,
		VIDEO_TASK_FAILED,
		VIDEO_TASK_EXPERIMENTAL
	} from '$lib/copy/reports';

	$: job = $replayVideoJob;
	$: pct = Math.round((job?.progress ?? 0) * 100);
</script>

<div class="stack">
	{#if job}
		<div class="card" transition:fly={{ y: 12, duration: 200 }}>
			{#if job.status === 'rendering'}
				<div class="row">
					<span class="spinner" aria-hidden="true"></span>
					<span class="msg">{VIDEO_TASK_RENDERING} {pct}%</span>
					<button class="link text" on:click={cancelReplayVideo}>{CANCEL_LABEL}</button>
				</div>
				<div class="bar"><span class="fill" style="width:{pct}%"></span></div>
				<p class="sub">{VIDEO_TASK_EXPERIMENTAL}</p>
			{:else if job.status === 'done'}
				<div class="row">
					<span class="dot success"></span>
					<span class="msg">{VIDEO_TASK_DONE}</span>
				</div>
			{:else}
				<div class="row">
					<span class="dot error"></span>
					<span class="msg">{VIDEO_TASK_FAILED}</span>
					<button class="link text" on:click={dismissReplayVideo}>{DISMISS_LABEL}</button>
				</div>
				{#if job.error}<p class="sub">{job.error}</p>{/if}
			{/if}
		</div>
	{/if}

	{#each $notifications as n (n.id)}
		<div class="card" animate:flip={{ duration: 180 }} transition:fly={{ y: 12, duration: 200 }}>
			<div class="row">
				<span class="dot {n.type}"></span>
				<span class="msg">{n.message}</span>
				<button class="link" on:click={() => dismissNotification(n.id)} aria-label={DISMISS_LABEL}>
					<svg width="12" height="12" viewBox="0 0 14 14" fill="none">
						<path
							d="M1 1l12 12M13 1L1 13"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		</div>
	{/each}
</div>

<style>
	.stack {
		position: fixed;
		right: 1rem;
		bottom: 3.25rem;
		/* Above the replay modal (500) so feedback stays visible over it. */
		z-index: 600;
		display: flex;
		flex-direction: column-reverse;
		gap: 0.5rem;
		max-width: min(20rem, calc(100vw - 2rem));
		pointer-events: none;
	}

	.card {
		pointer-events: auto;
		padding: 0.7rem 0.85rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
		font-size: 0.82rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.msg {
		flex: 1;
		color: var(--text);
		line-height: 1.35;
	}
	.sub {
		margin-top: 0.4rem;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--text-muted);
	}
	.dot.success {
		background: var(--pass);
	}
	.dot.error {
		background: var(--fail);
	}
	.dot.info {
		background: var(--accent);
	}

	.link {
		display: inline-flex;
		align-items: center;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		flex-shrink: 0;
	}
	.link.text {
		font-size: 0.75rem;
	}
	.link:hover {
		color: var(--accent);
	}

	.bar {
		margin-top: 0.55rem;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--bg-subtle);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 0.2s var(--ease-out);
	}
	.spinner {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2s;
		}
	}
</style>
