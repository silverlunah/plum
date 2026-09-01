<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import Paginator from '$lib/components/ui/Paginator.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { notify } from '$lib/stores/notifications';
	import { relativeTime } from '$lib/utils/format';
	import { ACTIVITY_PER_PAGE, ACTIVITY_RETENTION_DAYS } from '$lib/constants';
	import {
		fetchActivity,
		fetchActivityFilters,
		fetchActivityRetention,
		saveActivityRetention
	} from '$lib/api/activity';
	import {
		ACTIVITY_SCOPE_PROJECT_LABEL,
		ACTIVITY_SCOPE_ORG_LABEL,
		ACTIVITY_FILTER_ALL_ACTIONS,
		ACTIVITY_FILTER_ALL_ACTORS,
		ACTIVITY_SEARCH_PLACEHOLDER,
		ACTIVITY_EMPTY_TITLE,
		ACTIVITY_EMPTY_BODY,
		ACTIVITY_ORG_EMPTY_BODY,
		ACTIVITY_RETENTION_CARD_TITLE,
		ACTIVITY_RETENTION_DESC,
		ACTIVITY_RETENTION_SAVED_TOAST,
		ACTIVITY_RETENTION_SAVE_FAILED,
		activityRetentionOptionLabel,
		activityCountLabel,
		activityDescription,
		activityTone
	} from '$lib/copy/settings';

	export let canSeeOrg = false;

	let scope = 'project';
	let page = 0; // zero-based, for Paginator
	let action = '';
	let actorId = '';
	let search = ''; // bound to the input
	let q = ''; // debounced, feeds the query

	let entries = [];
	let total = 0;
	let filters = { actions: [], actors: [] };
	let loading = true;

	let retentionDays = 90;
	let savingRetention = false;

	let ready = false;
	let lastKey = null;

	async function loadFeed() {
		loading = true;
		const res = await fetchActivity(scope, { page: page + 1, action, actorId, q });
		entries = res.entries;
		total = res.total;
		loading = false;
	}

	let searchTimer;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			q = search.trim();
			page = 0;
		}, 250);
	}

	async function loadFilters() {
		filters = await fetchActivityFilters(scope);
	}

	function switchScope(next) {
		if (scope === next) return;
		scope = next;
		page = 0;
		action = '';
		actorId = '';
		search = '';
		q = '';
		loadFilters();
	}

	// One reactive drives every re-fetch: scope, a filter, the search term, or the
	// page changing produces a new key. Selects and search reset the page.
	$: key = `${scope}|${action}|${actorId}|${q}|${page}`;
	$: if (ready && key !== lastKey) {
		lastKey = key;
		loadFeed();
	}

	async function onRetentionChange(e) {
		const days = Number(e.target.value);
		savingRetention = true;
		try {
			const res = await saveActivityRetention(days);
			retentionDays = res.activityRetentionDays;
			notify('success', ACTIVITY_RETENTION_SAVED_TOAST);
		} catch {
			notify('error', ACTIVITY_RETENTION_SAVE_FAILED);
		} finally {
			savingRetention = false;
		}
	}

	onMount(async () => {
		await Promise.all([
			loadFeed(),
			loadFilters(),
			canSeeOrg
				? fetchActivityRetention().then((r) => (retentionDays = r.activityRetentionDays))
				: Promise.resolve()
		]);
		lastKey = key;
		ready = true;
	});

	$: emptyBody = scope === 'org' ? ACTIVITY_ORG_EMPTY_BODY : ACTIVITY_EMPTY_BODY;
</script>

<div class="card feed-card">
	{#if canSeeOrg}
		<div class="scope-tabs">
			<button class:active={scope === 'project'} on:click={() => switchScope('project')}>
				{ACTIVITY_SCOPE_PROJECT_LABEL}
			</button>
			<button class:active={scope === 'org'} on:click={() => switchScope('org')}>
				{ACTIVITY_SCOPE_ORG_LABEL}
			</button>
		</div>
	{/if}

	<div class="feed-body">
		<div class="feed-head">
			<input
				class="field-input search"
				type="search"
				placeholder={ACTIVITY_SEARCH_PLACEHOLDER}
				bind:value={search}
				on:input={onSearchInput}
			/>
			<div class="filters">
				<select class="field-input" bind:value={action} on:change={() => (page = 0)}>
					<option value="">{ACTIVITY_FILTER_ALL_ACTIONS}</option>
					{#each filters.actions as a}
						<option value={a}>
							{activityDescription({ action: a, targetLabel: '', metadata: {} }).verb}
						</option>
					{/each}
				</select>
				<select class="field-input" bind:value={actorId} on:change={() => (page = 0)}>
					<option value="">{ACTIVITY_FILTER_ALL_ACTORS}</option>
					{#each filters.actors as p}
						<option value={p.id}>{p.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<span class="count">{activityCountLabel(total)}</span>

		{#if loading && entries.length === 0}
			<p class="loading">…</p>
		{:else if entries.length === 0}
			<EmptyState title={ACTIVITY_EMPTY_TITLE} description={emptyBody} size="md" />
		{:else}
			<ul class="feed" class:dim={loading}>
				{#each entries as entry (entry.id)}
					{@const d = activityDescription(entry)}
					<li>
						<span class="dot {activityTone(entry.action)}"></span>
						<span class="line">
							<span class="actor">{entry.actorLabel}</span>
							{d.verb}
							{#if d.target}<span class="target">{d.target}</span>{/if}
							{#if d.detail}<span class="detail">({d.detail})</span>{/if}
						</span>
						<time datetime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
							{relativeTime(entry.createdAt)}
						</time>
					</li>
				{/each}
			</ul>
			<Paginator bind:page {total} perPage={ACTIVITY_PER_PAGE} />
		{/if}
	</div>
</div>

{#if canSeeOrg}
	<div class="card retention-card">
		<p class="card-title">{ACTIVITY_RETENTION_CARD_TITLE}</p>
		<p class="card-subtitle">{ACTIVITY_RETENTION_DESC}</p>
		<select
			class="field-input retention-select"
			value={retentionDays}
			disabled={savingRetention}
			on:change={onRetentionChange}
		>
			{#each ACTIVITY_RETENTION_DAYS as days}
				<option value={days}>{activityRetentionOptionLabel(days)}</option>
			{/each}
		</select>
	</div>
{/if}

<style>
	/* Card padding moves onto .feed-body so the tab bar can sit flush to the
	   card edge; overflow:hidden clips the tab bar's square top corners to the
	   card's radius. */
	.feed-card {
		padding: 0;
		overflow: hidden;
	}
	.scope-tabs {
		display: flex;
		background: var(--bg-subtle);
		border-bottom: 1px solid var(--border);
	}
	.scope-tabs button {
		flex: 1;
		padding: 0.85rem 1rem;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-muted);
		background: none;
		border: none;
		border-right: 1px solid var(--border);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		cursor: pointer;
	}
	.scope-tabs button:last-child {
		border-right: none;
	}
	.scope-tabs button.active {
		color: var(--text);
		background: var(--bg-elevated);
		border-bottom-color: var(--accent);
	}

	.feed-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
	}
	.feed-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.search {
		flex: 1;
		min-width: 180px;
		padding: 0.4rem 0.75rem;
		font-size: 0.8125rem;
	}
	.count {
		margin-top: -0.25rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-muted);
	}
	.filters {
		display: flex;
		gap: 0.5rem;
	}
	.filters .field-input {
		width: auto;
		min-width: 150px;
		padding: 0.4rem 0.65rem;
		padding-right: 1.9rem;
		font-size: 0.8125rem;
	}

	.loading {
		padding: 2rem 0;
		text-align: center;
		color: var(--text-muted);
	}

	.feed {
		list-style: none;
		margin: 0;
		padding: 0;
		transition: opacity var(--duration-fast);
	}
	.feed.dim {
		opacity: 0.5;
	}
	.feed li {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.7rem 0;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.feed li:first-child {
		border-top: none;
	}
	.dot {
		flex-shrink: 0;
		width: 7px;
		height: 7px;
		margin-top: 0.35rem;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.dot.create {
		background: var(--pass);
	}
	.dot.update {
		background: var(--warn);
	}
	.dot.delete {
		background: var(--fail);
	}
	.line {
		flex: 1;
		color: var(--text-muted);
	}
	.actor {
		color: var(--text);
		font-weight: 500;
	}
	.target {
		color: var(--text);
	}
	.detail {
		color: var(--text-muted);
	}
	.feed time {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.retention-card {
		margin-top: 1.25rem;
	}
	.retention-select {
		width: auto;
		min-width: 180px;
	}

	@media (max-width: 640px) {
		.filters {
			flex-wrap: wrap;
		}
		.filters .field-input {
			flex: 1 1 45%;
			min-width: 0;
		}
		.feed li {
			flex-wrap: wrap;
		}
		.feed time {
			flex-basis: 100%;
		}
	}
</style>
