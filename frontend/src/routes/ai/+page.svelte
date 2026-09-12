<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount, afterUpdate } from 'svelte';
	import { fly } from 'svelte/transition';
	import {
		listAiSessions,
		getAiSession,
		createAiSession,
		sendAiMessage,
		endAiSession
	} from '$lib/api/aiSessions';
	import { fetchAiConfig } from '$lib/api/settings';
	import { fetchRunners, fetchBuiltInEnabled } from '$lib/api/runners';
	import { notify } from '$lib/stores/notifications';
	import { relativeTime } from '$lib/utils/format';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import {
		PAGE_TITLE,
		HEADING,
		HEADER_DESC,
		CHAT_TAB_LABEL,
		HISTORY_TAB_LABEL,
		PROVIDER_LABEL,
		PROVIDER_ANTHROPIC_LABEL,
		PROVIDER_OPENAI_LABEL,
		NO_PROVIDER_CONFIGURED,
		TITLE_LABEL,
		TITLE_PLACEHOLDER,
		NODES_LABEL,
		START_SESSION_LABEL,
		STARTING_SESSION_LABEL,
		MESSAGE_PLACEHOLDER,
		SEND_LABEL,
		SENDING_LABEL,
		END_SESSION_LABEL,
		NEW_SESSION_LABEL,
		OPEN_PR_LABEL,
		BROWSER_PANEL_TITLE,
		BROWSER_PANEL_EMPTY,
		BROWSER_PANEL_UNAVAILABLE,
		NO_SESSIONS_YET_TITLE,
		NO_SESSIONS_YET_DESC,
		FAILED_TO_LOAD_SESSIONS,
		FAILED_TO_START_SESSION,
		FAILED_TO_SEND_MESSAGE,
		sessionSubtitle
	} from '$lib/copy/aiAgent';

	/** @type {'chat' | 'history'} */
	let tab =
		(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('plum:ai:tab')) || 'chat';
	function setTab(t) {
		tab = t;
		try {
			sessionStorage.setItem('plum:ai:tab', t);
		} catch {}
	}

	let sessions = [];
	let loadingSessions = true;
	let activeSession = null;
	let loadingActiveSession = false;

	let providers = { anthropicApiKeySet: false, openaiApiKeySet: false };
	let runnerOptions = [];
	let builtInEnabled = true;
	let form = { provider: '', title: '', runnerIds: ['built-in'] };
	let starting = false;

	let draft = '';
	let sending = false;
	let confirmEnd = false;
	let messagesEl;
	let stickToBottom = true;

	async function loadSessions() {
		loadingSessions = true;
		try {
			sessions = await listAiSessions();
		} catch {
			notify('error', FAILED_TO_LOAD_SESSIONS);
		} finally {
			loadingSessions = false;
		}
	}

	async function openSession(id) {
		loadingActiveSession = true;
		try {
			activeSession = await getAiSession(id);
			try {
				sessionStorage.setItem('plum:ai:sessionId', id);
			} catch {}
			setTab('chat');
		} finally {
			loadingActiveSession = false;
		}
	}

	function toggleRunner(id) {
		form.runnerIds = form.runnerIds.includes(id)
			? form.runnerIds.filter((r) => r !== id)
			: [...form.runnerIds, id];
	}

	async function startSession() {
		if (!form.provider) return;
		starting = true;
		try {
			const session = await createAiSession({
				provider: form.provider,
				title: form.title,
				runnerIds: form.runnerIds
			});
			activeSession = session;
			sessions = [session, ...sessions];
			try {
				sessionStorage.setItem('plum:ai:sessionId', session.id);
			} catch {}
			form = { provider: form.provider, title: '', runnerIds: ['built-in'] };
		} catch (e) {
			notify('error', e.message || FAILED_TO_START_SESSION);
		} finally {
			starting = false;
		}
	}

	async function send(override) {
		const message = override ?? draft.trim();
		if (!message || sending || !activeSession) return;
		if (override === undefined) draft = '';
		sending = true;
		try {
			activeSession = await sendAiMessage(activeSession.id, message);
			stickToBottom = true;
		} catch (e) {
			notify('error', e.message || FAILED_TO_SEND_MESSAGE);
			if (override === undefined) draft = message;
		} finally {
			sending = false;
		}
	}

	async function confirmEndSession() {
		confirmEnd = false;
		await endAiSession(activeSession.id);
		activeSession = null;
		try {
			sessionStorage.removeItem('plum:ai:sessionId');
		} catch {}
		loadSessions();
	}

	function newSessionDraft() {
		activeSession = null;
		try {
			sessionStorage.removeItem('plum:ai:sessionId');
		} catch {}
	}

	// The agent's own screenshot tool calls are the only "live browser" view for
	// Claude sessions, OpenAI has no browser MCP wired at all (see
	// aiAgentService.runOpenAiTurn), so the panel just isn't shown for it.
	$: latestScreenshot = (() => {
		if (!activeSession) return null;
		for (let i = activeSession.transcript.length - 1; i >= 0; i--) {
			const blocks = activeSession.transcript[i].blocks || [];
			for (let j = blocks.length - 1; j >= 0; j--) {
				if (blocks[j].image) return blocks[j].image;
			}
		}
		return null;
	})();

	function onScroll() {
		if (!messagesEl) return;
		stickToBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 40;
	}

	afterUpdate(() => {
		if (stickToBottom && messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
	});

	onMount(async () => {
		const [ai, runners, builtIn] = await Promise.all([
			fetchAiConfig(),
			fetchRunners(),
			fetchBuiltInEnabled()
		]);
		providers = ai;
		runnerOptions = runners;
		builtInEnabled = builtIn.builtInRunnerEnabled;
		form.provider = ai.anthropicApiKeySet ? 'anthropic' : ai.openaiApiKeySet ? 'openai' : '';

		loadSessions();
		let savedId, kickoffMessage;
		try {
			savedId = sessionStorage.getItem('plum:ai:sessionId');
			kickoffMessage = sessionStorage.getItem('plum:ai:kickoffMessage');
			sessionStorage.removeItem('plum:ai:kickoffMessage');
		} catch {}
		if (savedId) {
			await openSession(savedId);
			// Only for a session that hasn't had a first message yet, e.g. one just
			// created by a report's "AI Analyze" button, never re-fires on a reload
			// of an existing conversation since the sessionStorage key is one-shot.
			if (kickoffMessage && activeSession?.transcript.length === 0) send(kickoffMessage);
		}
	});
</script>

<svelte:head>
	<title>{PAGE_TITLE}</title>
</svelte:head>

<div class="header">
	<h1>{HEADING}</h1>
	<p class="desc">{HEADER_DESC}</p>
</div>

<div class="tabs">
	<button class="tab" class:active={tab === 'chat'} on:click={() => setTab('chat')}
		>{CHAT_TAB_LABEL}</button
	>
	<button class="tab" class:active={tab === 'history'} on:click={() => setTab('history')}
		>{HISTORY_TAB_LABEL}</button
	>
</div>

{#if tab === 'chat'}
	{#if loadingActiveSession}
		<p class="muted">Loading…</p>
	{:else if !activeSession}
		<div class="new-session" in:fly={{ y: 8, duration: 150 }}>
			{#if !providers.anthropicApiKeySet && !providers.openaiApiKeySet}
				<EmptyState title={NO_PROVIDER_CONFIGURED} />
			{:else}
				<div class="field">
					<span class="field-label">{PROVIDER_LABEL}</span>
					<div class="provider-options">
						{#if providers.anthropicApiKeySet}
							<button
								class="provider-option"
								class:selected={form.provider === 'anthropic'}
								on:click={() => (form.provider = 'anthropic')}>{PROVIDER_ANTHROPIC_LABEL}</button
							>
						{/if}
						{#if providers.openaiApiKeySet}
							<button
								class="provider-option"
								class:selected={form.provider === 'openai'}
								on:click={() => (form.provider = 'openai')}>{PROVIDER_OPENAI_LABEL}</button
							>
						{/if}
					</div>
				</div>
				<div class="field">
					<span class="field-label">{TITLE_LABEL}</span>
					<input class="text-input" placeholder={TITLE_PLACEHOLDER} bind:value={form.title} />
				</div>
				<div class="field">
					<span class="field-label">{NODES_LABEL}</span>
					<div class="node-options">
						{#if builtInEnabled}
							<label class="node-option">
								<input
									type="checkbox"
									checked={form.runnerIds.includes('built-in')}
									on:change={() => toggleRunner('built-in')}
								/>
								<span>Built-in</span>
							</label>
						{/if}
						{#each runnerOptions as r}
							<label class="node-option">
								<input
									type="checkbox"
									checked={form.runnerIds.includes(r.id)}
									on:change={() => toggleRunner(r.id)}
								/>
								<span>{r.name}</span>
							</label>
						{/each}
					</div>
				</div>
				<Button disabled={!form.provider || starting} on:click={startSession}>
					{starting ? STARTING_SESSION_LABEL : START_SESSION_LABEL}
				</Button>
			{/if}
		</div>
	{:else}
		<div class="session-header">
			<div class="session-title">
				<span class="session-name">{activeSession.title || activeSession.id}</span>
				<span class="session-meta">{sessionSubtitle(activeSession)}</span>
			</div>
			<div class="session-actions">
				{#if activeSession.prUrl}
					<a class="pr-link" href={activeSession.prUrl} target="_blank" rel="noreferrer"
						>{OPEN_PR_LABEL}</a
					>
				{/if}
				<button class="link-btn" on:click={newSessionDraft}>{NEW_SESSION_LABEL}</button>
				<button class="link-btn danger" on:click={() => (confirmEnd = true)}
					>{END_SESSION_LABEL}</button
				>
			</div>
		</div>

		<div class="workspace">
			<div class="chat-pane">
				<div class="messages" bind:this={messagesEl} on:scroll={onScroll}>
					{#if activeSession.transcript.length === 0}
						<EmptyState message="Say hello to get started." />
					{/if}
					{#each activeSession.transcript as msg}
						<div class="message" class:from-user={msg.role === 'user'}>
							{#each msg.blocks as block}
								{#if block.type === 'text'}
									<p class="text-block">{block.text}</p>
								{:else if block.type === 'thinking'}
									<p class="thinking-block">{block.text}</p>
								{:else if block.type === 'tool_call'}
									<div class="tool-block">
										<div class="tool-head">
											<span class="tool-name">{block.name}</span>
											<Badge
												variant={block.status === 'error'
													? 'fail'
													: block.status === 'done'
														? 'pass'
														: 'neutral'}>{block.status}</Badge
											>
										</div>
										{#if block.output}<pre class="tool-output">{block.output}</pre>{/if}
									</div>
								{:else if block.type === 'result'}
									<p class="result-block">{block.text}</p>
								{:else if block.type === 'error'}
									<p class="error-block">{block.text}</p>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
				<form class="composer" on:submit|preventDefault={() => send()}>
					<input
						class="text-input"
						placeholder={MESSAGE_PLACEHOLDER}
						bind:value={draft}
						disabled={sending}
					/>
					<Button type="submit" disabled={sending || !draft.trim()}>
						{sending ? SENDING_LABEL : SEND_LABEL}
					</Button>
				</form>
			</div>

			<div class="browser-pane">
				<span class="field-label">{BROWSER_PANEL_TITLE}</span>
				{#if activeSession.provider === 'openai'}
					<EmptyState message={BROWSER_PANEL_UNAVAILABLE} size="sm" />
				{:else if latestScreenshot}
					<img class="browser-shot" src={latestScreenshot} alt="Agent's browser" />
				{:else}
					<EmptyState message={BROWSER_PANEL_EMPTY} size="sm" />
				{/if}
			</div>
		</div>
	{/if}
{:else if loadingSessions}
	<p class="muted">Loading…</p>
{:else if sessions.length === 0}
	<EmptyState title={NO_SESSIONS_YET_TITLE} description={NO_SESSIONS_YET_DESC} />
{:else}
	<ul class="session-list">
		{#each sessions as s (s.id)}
			<li>
				<button class="session-row" on:click={() => openSession(s.id)}>
					<span class="session-row-title">{s.title || s.id}</span>
					<span class="session-row-meta">{sessionSubtitle(s)} · {relativeTime(s.updatedAt)}</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<ConfirmModal
	bind:open={confirmEnd}
	title={END_SESSION_LABEL}
	confirmLabel={END_SESSION_LABEL}
	on:confirm={confirmEndSession}
>
	End this session? Its workspace will be removed.
</ConfirmModal>

<style>
	.header {
		margin-bottom: 1.5rem;
	}
	h1 {
		font-family: var(--font-display);
		font-weight: 400;
		font-size: 1.75rem;
		margin: 0 0 0.25rem;
	}
	.desc {
		color: var(--text-muted);
		margin: 0;
	}
	.muted {
		color: var(--text-muted);
	}

	.tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1.5rem;
	}
	.tab {
		font: inherit;
		font-size: 0.875rem;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.6rem 0.25rem;
		margin-right: 1.25rem;
		cursor: pointer;
	}
	.tab.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.new-session {
		max-width: 420px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.provider-options,
	.node-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.provider-option {
		font: inherit;
		font-size: 0.875rem;
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		cursor: pointer;
	}
	.provider-option.selected {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.node-option {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
	}
	.text-input {
		font: inherit;
		padding: 0.5rem 0.7rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
	}

	.session-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		gap: 1rem;
	}
	.session-title {
		display: flex;
		flex-direction: column;
	}
	.session-name {
		font-weight: 600;
	}
	.session-meta {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.session-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.pr-link {
		font-size: 0.8125rem;
		color: var(--accent);
	}
	.link-btn {
		font: inherit;
		font-size: 0.8125rem;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.link-btn:hover {
		color: var(--text);
	}
	.link-btn.danger:hover {
		color: var(--fail);
	}

	.workspace {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 900px) {
		.workspace {
			grid-template-columns: 1fr;
		}
	}

	.chat-pane {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		height: 60vh;
		min-height: 360px;
	}
	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.message {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 85%;
	}
	.message.from-user {
		align-self: flex-end;
		align-items: flex-end;
	}
	.message.from-user .text-block {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.text-block {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		white-space: pre-wrap;
	}
	.thinking-block {
		margin: 0;
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--text-muted);
	}
	.result-block {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--pass-soft);
		color: var(--pass);
		white-space: pre-wrap;
	}
	.error-block {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--fail-soft);
		color: var(--fail);
	}
	.tool-block {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.65rem;
		background: var(--bg);
	}
	.tool-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.tool-name {
		font-family: var(--font-mono, monospace);
		font-size: 0.8125rem;
	}
	.tool-output {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		white-space: pre-wrap;
		max-height: 120px;
		overflow-y: auto;
	}

	.composer {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid var(--border);
	}
	.composer .text-input {
		flex: 1;
	}

	.browser-pane {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		padding: 0.75rem;
	}
	.browser-shot {
		width: 100%;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}

	.session-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.session-row {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		text-align: left;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		cursor: pointer;
	}
	.session-row:hover {
		border-color: var(--text-muted);
	}
	.session-row-title {
		font-weight: 600;
	}
	.session-row-meta {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
