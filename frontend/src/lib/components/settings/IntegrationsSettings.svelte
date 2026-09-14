<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { notify } from '$lib/stores/notifications';
	import { auth } from '$lib/stores/auth';
	import { API_BASE, COPY_TIMEOUT_MS } from '$lib/constants';
	import { copyText } from '$lib/utils/clipboard';
	import Button from '$lib/components/ui/Button.svelte';
	import ServiceIcon from '$lib/components/icons/ServiceIcon.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		fetchIntegrations,
		saveIntegrations,
		fetchAiConfig,
		saveAiConfig,
		fetchProjectAiConfig,
		saveProjectAiConfig,
		fetchGithubConfig,
		saveGithubConfig,
		verifyGithubConnection,
		fetchProjectGithubConfig,
		saveProjectGithubConfig
	} from '$lib/api/settings';
	import {
		INTEGRATIONS_LABEL,
		INTEGRATIONS_DESC,
		WEBHOOKS_TAB_LABEL,
		AI_TAB_LABEL,
		GITHUB_TAB_LABEL,
		WEBHOOKS_CARD_TITLE,
		DISCORD_WEBHOOK_LABEL,
		DISCORD_WEBHOOK_HINT,
		DISCORD_WEBHOOK_PLACEHOLDER,
		SLACK_WEBHOOK_LABEL,
		SLACK_WEBHOOK_HINT,
		SLACK_WEBHOOK_PLACEHOLDER,
		INTEGRATIONS_SAVED_TOAST,
		INTEGRATIONS_SAVE_FAILED,
		saveIntegrationsLabel,
		CI_TRIGGERS_CARD_TITLE,
		CI_DESC_PART1,
		CI_DESC_PART2,
		CI_DESC_PART3,
		MCP_TAB_LINK_LABEL,
		CI_DESC_PART4,
		EXTERNAL_BADGE_LABEL,
		copyCiSnippetLabel,
		AI_PROVIDER_CARD_TITLE,
		AI_PROVIDER_CARD_DESC,
		AI_PROVIDER_CARDS,
		API_KEY_LABEL,
		MODEL_LABEL,
		PROVIDER_CONNECTED_LABEL,
		PROVIDER_DISCONNECTED_LABEL,
		AI_CONFIG_SAVED_TOAST,
		AI_CONFIG_SAVE_FAILED,
		saveProviderKeyLabel,
		AI_BEHAVIOUR_CARD_TITLE,
		AI_BEHAVIOUR_CARD_DESC,
		AI_SYSTEM_PROMPT_LABEL,
		AI_SYSTEM_PROMPT_PLACEHOLDER,
		AI_CODE_PRACTICES_LABEL,
		AI_CODE_PRACTICES_PLACEHOLDER,
		AI_PROJECT_CONFIG_SAVED_TOAST,
		AI_PROJECT_CONFIG_SAVE_FAILED,
		AI_OWNER_ONLY_NOTE,
		saveAiBehaviourLabel,
		GITHUB_CONNECTION_CARD_TITLE,
		GITHUB_CONNECTION_CARD_DESC,
		GITHUB_TOKEN_LABEL,
		GITHUB_TOKEN_PLACEHOLDER,
		GITHUB_CONFIG_SAVED_TOAST,
		GITHUB_CONFIG_SAVE_FAILED,
		saveGithubConnectionLabel,
		verifyGithubConnectionLabel,
		GITHUB_VERIFY_FAILED,
		githubConnectedAsLabel,
		GITHUB_REPO_CARD_TITLE,
		GITHUB_REPO_CARD_DESC,
		GITHUB_OWNER_LABEL,
		GITHUB_OWNER_PLACEHOLDER,
		GITHUB_REPO_LABEL,
		GITHUB_REPO_PLACEHOLDER,
		GITHUB_DEFAULT_BRANCH_LABEL,
		GITHUB_DEFAULT_BRANCH_PLACEHOLDER,
		GITHUB_PROJECT_CONFIG_SAVED_TOAST,
		GITHUB_PROJECT_CONFIG_SAVE_FAILED,
		saveGithubRepoLabel,
		secretKeyHint,
		secretKeyPlaceholder
	} from '$lib/copy/settings';

	// The MCP tab is a different top-level settings section owned by the parent page.
	export let goToSection = () => {};

	$: isOwner = $auth.user?.role === 'owner';

	const VALID_TABS = new Set(['webhooks', 'ai', 'github']);
	let integrationsTab =
		(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('plum:integrations:tab')) ||
		'ai';
	if (!VALID_TABS.has(integrationsTab)) integrationsTab = 'ai';

	function setTab(t) {
		integrationsTab = t;
		try {
			sessionStorage.setItem('plum:integrations:tab', t);
		} catch {}
	}

	const snapshot = (o) => JSON.stringify(o);

	// ── Webhooks ──
	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '' };
	let integrationsSaving = false;
	let integrationsPristine = snapshot(integrations);
	$: integrationsDirty = snapshot(integrations) !== integrationsPristine;
	let ciSnippetCopied = false;
	$: ciWorkflowSnippet = [
		'- name: Run Plum tests',
		'  run: |',
		`    curl -X POST ${API_BASE}/trigger \\`,
		'      -H "Authorization: ApiKey ${{ secrets.PLUM_API_KEY }}" \\',
		'      -H "Content-Type: application/json" \\',
		'      -d \'{"tag": "@smoke", "baseUrl": "https://your-pr-preview-url"}\''
	].join('\n');

	async function handleSaveIntegrations() {
		integrationsSaving = true;
		try {
			integrations = await saveIntegrations(integrations);
			integrationsPristine = snapshot(integrations);
			notify('success', INTEGRATIONS_SAVED_TOAST);
		} catch {
			notify('error', INTEGRATIONS_SAVE_FAILED);
		} finally {
			integrationsSaving = false;
		}
	}

	function handleCopyCiSnippet() {
		copyText(ciWorkflowSnippet).then(() => {
			ciSnippetCopied = true;
			setTimeout(() => (ciSnippetCopied = false), COPY_TIMEOUT_MS);
		});
	}

	// ── AI ──
	let aiConfig = {
		anthropicApiKeySet: false,
		anthropicModel: '',
		openaiApiKeySet: false,
		openaiModel: ''
	};
	// Keyed by provider id so the two cards share one set of handlers.
	let aiKeyInputs = { anthropic: '', openai: '' };
	let aiModels = { anthropic: '', openai: '' };
	let openProvider = '';
	let savingProvider = '';

	// Keyed by id rather than read through a helper: Svelte can't see an
	// `aiConfig` lookup hidden inside a function call, so the badge would go stale.
	$: providerConnected = {
		anthropic: aiConfig.anthropicApiKeySet === true,
		openai: aiConfig.openaiApiKeySet === true
	};

	let projectAiConfig = { aiSystemPrompt: '', aiCodePractices: '' };
	let projectAiConfigSaving = false;
	let projectAiConfigPristine = snapshot(projectAiConfig);
	$: projectAiConfigDirty = snapshot(projectAiConfig) !== projectAiConfigPristine;

	// Omits the other provider's fields entirely, which the backend leaves unchanged.
	async function handleSaveProvider(id) {
		savingProvider = id;
		try {
			aiConfig = await saveAiConfig({
				[`${id}ApiKey`]: aiKeyInputs[id],
				[`${id}Model`]: aiModels[id]
			});
			aiKeyInputs[id] = '';
			notify('success', AI_CONFIG_SAVED_TOAST);
		} catch (e) {
			notify('error', e.message || AI_CONFIG_SAVE_FAILED);
		} finally {
			savingProvider = '';
		}
	}

	async function handleSaveAiBehaviour() {
		projectAiConfigSaving = true;
		try {
			projectAiConfig = await saveProjectAiConfig(projectAiConfig);
			projectAiConfigPristine = snapshot(projectAiConfig);
			notify('success', AI_PROJECT_CONFIG_SAVED_TOAST);
		} catch {
			notify('error', AI_PROJECT_CONFIG_SAVE_FAILED);
		} finally {
			projectAiConfigSaving = false;
		}
	}

	// ── GitHub ──
	let githubConfig = { githubTokenSet: false };
	let githubTokenInput = '';
	let githubConfigSaving = false;
	let githubVerifying = false;
	let githubConnectedAs = '';

	let projectGithubConfig = { githubOwner: '', githubRepo: '', githubDefaultBranch: 'main' };
	let projectGithubConfigSaving = false;
	let projectGithubConfigPristine = snapshot(projectGithubConfig);
	$: projectGithubConfigDirty = snapshot(projectGithubConfig) !== projectGithubConfigPristine;

	async function handleSaveGithubConnection() {
		githubConfigSaving = true;
		githubConnectedAs = '';
		try {
			githubConfig = await saveGithubConfig({ githubToken: githubTokenInput });
			githubTokenInput = '';
			notify('success', GITHUB_CONFIG_SAVED_TOAST);
		} catch {
			notify('error', GITHUB_CONFIG_SAVE_FAILED);
		} finally {
			githubConfigSaving = false;
		}
	}

	async function handleVerifyGithubConnection() {
		githubVerifying = true;
		try {
			const { username } = await verifyGithubConnection();
			githubConnectedAs = username;
		} catch (e) {
			githubConnectedAs = '';
			notify('error', e.message || GITHUB_VERIFY_FAILED);
		} finally {
			githubVerifying = false;
		}
	}

	async function handleSaveGithubRepo() {
		projectGithubConfigSaving = true;
		try {
			projectGithubConfig = await saveProjectGithubConfig(projectGithubConfig);
			projectGithubConfigPristine = snapshot(projectGithubConfig);
			notify('success', GITHUB_PROJECT_CONFIG_SAVED_TOAST);
		} catch {
			notify('error', GITHUB_PROJECT_CONFIG_SAVE_FAILED);
		} finally {
			projectGithubConfigSaving = false;
		}
	}

	onMount(async () => {
		try {
			integrations = await fetchIntegrations();
			integrationsPristine = snapshot(integrations);
		} catch {}
		try {
			projectAiConfig = await fetchProjectAiConfig();
			projectAiConfigPristine = snapshot(projectAiConfig);
		} catch {}
		try {
			projectGithubConfig = await fetchProjectGithubConfig();
			projectGithubConfigPristine = snapshot(projectGithubConfig);
		} catch {}
		if (isOwner) {
			try {
				aiConfig = await fetchAiConfig();
				aiModels = { anthropic: aiConfig.anthropicModel, openai: aiConfig.openaiModel };
				// So a fresh instance shows a form instead of two closed rows.
				openProvider = AI_PROVIDER_CARDS.find((p) => !aiConfig[`${p.id}ApiKeySet`])?.id ?? '';
			} catch {}
			try {
				githubConfig = await fetchGithubConfig();
			} catch {}
		}
	});
</script>

<div class="content-header">
	<h2>{INTEGRATIONS_LABEL}</h2>
	<p class="content-desc">{INTEGRATIONS_DESC}</p>
</div>

<div class="tabs">
	<button class="tab" class:active={integrationsTab === 'ai'} on:click={() => setTab('ai')}>
		{AI_TAB_LABEL}
	</button>
	<button class="tab" class:active={integrationsTab === 'github'} on:click={() => setTab('github')}>
		{GITHUB_TAB_LABEL}
	</button>
	<button
		class="tab"
		class:active={integrationsTab === 'webhooks'}
		on:click={() => setTab('webhooks')}
	>
		{WEBHOOKS_TAB_LABEL}
	</button>
</div>

{#if integrationsTab === 'ai'}
	{#if isOwner}
		<div class="provider-section">
			<p class="card-title">{AI_PROVIDER_CARD_TITLE}</p>
			<p class="content-desc">{AI_PROVIDER_CARD_DESC}</p>
		</div>

		<div class="provider-list">
			{#each AI_PROVIDER_CARDS as provider}
				{@const connected = providerConnected[provider.id]}
				{@const open = openProvider === provider.id}
				<div class="card provider-card" class:provider-card-open={open}>
					<button
						class="provider-header"
						aria-expanded={open}
						on:click={() => (openProvider = open ? '' : provider.id)}
					>
						<span class="provider-logo"><ServiceIcon service={provider.icon} size={20} /></span>
						<span class="provider-heading">
							<span class="provider-name">{provider.name}</span>
							<span class="provider-desc">{provider.desc}</span>
						</span>
						<span class="provider-state" class:provider-state-on={connected}>
							{connected ? PROVIDER_CONNECTED_LABEL : PROVIDER_DISCONNECTED_LABEL}
						</span>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							class="provider-chevron"
							class:rotated={open}
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>

					{#if open}
						<div class="provider-body" transition:slide={{ duration: 200 }}>
							<div class="field-row">
								<div class="field">
									<label class="field-label" for="{provider.id}-key">
										<span>{API_KEY_LABEL}</span>
										<span class="field-hint">{secretKeyHint(connected)}</span>
									</label>
									<input
										id="{provider.id}-key"
										type="password"
										class="field-input"
										bind:value={aiKeyInputs[provider.id]}
										placeholder={connected
											? secretKeyPlaceholder(connected)
											: provider.keyPlaceholder}
										autocomplete="new-password"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="{provider.id}-model">{MODEL_LABEL}</label>
									<input
										id="{provider.id}-model"
										type="text"
										class="field-input"
										bind:value={aiModels[provider.id]}
										placeholder={provider.modelPlaceholder}
									/>
								</div>
							</div>

							<div class="card-footer">
								<Button
									on:click={() => handleSaveProvider(provider.id)}
									disabled={savingProvider === provider.id}
								>
									{saveProviderKeyLabel(savingProvider === provider.id)}
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="content-desc owner-note">{AI_OWNER_ONLY_NOTE}</p>
	{/if}

	<div class="card settings-card">
		<p class="card-title">{AI_BEHAVIOUR_CARD_TITLE}</p>
		<p class="content-desc">{AI_BEHAVIOUR_CARD_DESC}</p>

		<div class="field">
			<label class="field-label" for="ai-system-prompt">{AI_SYSTEM_PROMPT_LABEL}</label>
			<textarea
				id="ai-system-prompt"
				class="field-input"
				rows="3"
				bind:value={projectAiConfig.aiSystemPrompt}
				placeholder={AI_SYSTEM_PROMPT_PLACEHOLDER}
			></textarea>
		</div>
		<div class="field">
			<label class="field-label" for="ai-code-practices">{AI_CODE_PRACTICES_LABEL}</label>
			<textarea
				id="ai-code-practices"
				class="field-input"
				rows="3"
				bind:value={projectAiConfig.aiCodePractices}
				placeholder={AI_CODE_PRACTICES_PLACEHOLDER}
			></textarea>
		</div>

		<div class="card-footer">
			<Button
				on:click={handleSaveAiBehaviour}
				disabled={projectAiConfigSaving || !projectAiConfigDirty}
			>
				{saveAiBehaviourLabel(projectAiConfigSaving)}
			</Button>
		</div>
	</div>
{:else if integrationsTab === 'github'}
	{#if isOwner}
		<div class="card settings-card">
			<p class="card-title card-title-icon">
				<ServiceIcon service="github" size={18} />
				{GITHUB_CONNECTION_CARD_TITLE}
			</p>
			<p class="content-desc">{GITHUB_CONNECTION_CARD_DESC}</p>

			<div class="field">
				<label class="field-label" for="github-token">
					<span>{GITHUB_TOKEN_LABEL}</span>
					<span class="field-hint">{secretKeyHint(githubConfig.githubTokenSet)}</span>
				</label>
				<input
					id="github-token"
					type="password"
					class="field-input"
					bind:value={githubTokenInput}
					placeholder={secretKeyPlaceholder(githubConfig.githubTokenSet)}
					autocomplete="new-password"
				/>
			</div>

			<div class="card-footer">
				<Button on:click={handleSaveGithubConnection} disabled={githubConfigSaving}>
					{saveGithubConnectionLabel(githubConfigSaving)}
				</Button>
				{#if githubConfig.githubTokenSet}
					<Button
						variant="ghost"
						on:click={handleVerifyGithubConnection}
						disabled={githubVerifying}
					>
						{verifyGithubConnectionLabel(githubVerifying)}
					</Button>
				{/if}
				{#if githubConnectedAs}
					<span class="connected-as">{githubConnectedAsLabel(githubConnectedAs)}</span>
				{/if}
			</div>
		</div>
	{:else}
		<p class="content-desc owner-note">{AI_OWNER_ONLY_NOTE}</p>
	{/if}

	<div class="card settings-card">
		<p class="card-title">{GITHUB_REPO_CARD_TITLE}</p>
		<p class="content-desc">{GITHUB_REPO_CARD_DESC}</p>

		<div class="field-row">
			<div class="field">
				<label class="field-label" for="github-owner">{GITHUB_OWNER_LABEL}</label>
				<input
					id="github-owner"
					type="text"
					class="field-input"
					bind:value={projectGithubConfig.githubOwner}
					placeholder={GITHUB_OWNER_PLACEHOLDER}
				/>
			</div>
			<div class="field">
				<label class="field-label" for="github-repo">{GITHUB_REPO_LABEL}</label>
				<input
					id="github-repo"
					type="text"
					class="field-input"
					bind:value={projectGithubConfig.githubRepo}
					placeholder={GITHUB_REPO_PLACEHOLDER}
				/>
			</div>
			<div class="field">
				<label class="field-label" for="github-branch">{GITHUB_DEFAULT_BRANCH_LABEL}</label>
				<input
					id="github-branch"
					type="text"
					class="field-input"
					bind:value={projectGithubConfig.githubDefaultBranch}
					placeholder={GITHUB_DEFAULT_BRANCH_PLACEHOLDER}
				/>
			</div>
		</div>

		<div class="card-footer">
			<Button
				on:click={handleSaveGithubRepo}
				disabled={projectGithubConfigSaving || !projectGithubConfigDirty}
			>
				{saveGithubRepoLabel(projectGithubConfigSaving)}
			</Button>
		</div>
	</div>
{:else}
	<div class="card settings-card">
		<p class="card-title">{WEBHOOKS_CARD_TITLE}</p>

		<div class="field">
			<label class="field-label" for="discord-url">
				<span><ServiceIcon service="discord" size={13} /> {DISCORD_WEBHOOK_LABEL}</span>
				<span class="field-hint">{DISCORD_WEBHOOK_HINT}</span>
			</label>
			<input
				id="discord-url"
				type="url"
				class="field-input"
				bind:value={integrations.discordWebhookUrl}
				placeholder={DISCORD_WEBHOOK_PLACEHOLDER}
			/>
		</div>

		<div class="field">
			<label class="field-label" for="slack-url">
				<span><ServiceIcon service="slack" size={13} /> {SLACK_WEBHOOK_LABEL}</span>
				<span class="field-hint">{SLACK_WEBHOOK_HINT}</span>
			</label>
			<input
				id="slack-url"
				type="url"
				class="field-input"
				bind:value={integrations.slackWebhookUrl}
				placeholder={SLACK_WEBHOOK_PLACEHOLDER}
			/>
		</div>

		<Button on:click={handleSaveIntegrations} disabled={integrationsSaving || !integrationsDirty}>
			{saveIntegrationsLabel(integrationsSaving)}
		</Button>
	</div>

	<div class="card settings-card">
		<p class="card-title">{CI_TRIGGERS_CARD_TITLE}</p>
		<p class="content-desc">
			{CI_DESC_PART1} <code class="code-sample">POST {API_BASE}/trigger</code>
			{CI_DESC_PART2}
			<code class="code-sample">Authorization: ApiKey …</code>
			{CI_DESC_PART3}
			<button class="link-btn" on:click={() => goToSection('mcp')}>{MCP_TAB_LINK_LABEL}</button>
			{CI_DESC_PART4}
			<Badge variant="external">{EXTERNAL_BADGE_LABEL}</Badge>.
		</p>
		<pre class="mcp-snippet">{ciWorkflowSnippet}</pre>
		<div class="card-footer">
			<Button variant="ghost" on:click={handleCopyCiSnippet}>
				{copyCiSnippetLabel(ciSnippetCopied)}
			</Button>
		</div>
	</div>
{/if}

<style>
	.card-title-icon {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.content-header {
		margin-bottom: 0.25rem;
	}
	.content-header h2 {
		font-size: 1.1rem;
		font-weight: 500;
		font-family: var(--font-body);
		color: var(--text);
		margin-bottom: 0.25rem;
	}
	.content-desc {
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.owner-note {
		margin-bottom: 1.25rem;
	}
	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		margin-bottom: 1.25rem;
	}
	.provider-section {
		margin-bottom: 1rem;
	}
	.provider-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.provider-card {
		padding: 0;
		overflow: hidden;
	}
	.provider-card-open {
		border-color: var(--accent);
	}
	.provider-header {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		width: 100%;
		padding: 1rem 1.25rem;
		font-family: inherit;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background var(--duration-fast);
	}
	.provider-header:hover {
		background: var(--bg-subtle);
	}
	.provider-logo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: var(--radius-md);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
	}
	.provider-heading {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.provider-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
	}
	.provider-desc {
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.provider-state {
		margin-left: auto;
		flex-shrink: 0;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
	}
	.provider-state-on {
		color: var(--pass);
		background: var(--pass-soft);
		border-color: transparent;
	}
	.provider-chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform var(--duration-fast) var(--ease-out);
	}
	.provider-chevron.rotated {
		transform: rotate(90deg);
	}
	.provider-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1.25rem;
		border-top: 1px solid var(--border);
	}
	@media (max-width: 640px) {
		.provider-desc,
		.provider-state {
			display: none;
		}
		.provider-state-on {
			display: inline-block;
		}
	}
	.field-row {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.field-row .field {
		flex: 1;
		min-width: 180px;
	}
	.field-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}
	.card-footer {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-top: 0.5rem;
	}
	.connected-as {
		font-size: 0.8125rem;
		color: var(--pass);
	}
	.code-sample {
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.05rem 0.4rem;
		font-size: 0.8125rem;
	}
	.mcp-snippet {
		background: var(--terminal-bg);
		color: var(--terminal-text);
		border-radius: var(--radius-sm);
		padding: 0.75rem 1rem;
		font-size: 0.8125rem;
		overflow-x: auto;
	}
	.link-btn {
		font: inherit;
		color: var(--accent);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	/* ── Tabs ── */
	.tabs {
		display: flex;
		gap: 0.125rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem 0.625rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color var(--duration-fast),
			border-color var(--duration-fast);
		margin-bottom: -1px;
	}
	.tab:hover {
		color: var(--text);
	}
	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: 500;
	}
</style>
