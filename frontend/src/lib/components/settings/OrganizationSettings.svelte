<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { notify } from '$lib/stores/notifications';
	import { patchBranding } from '$lib/stores/branding';
	import Button from '$lib/components/ui/Button.svelte';
	import { fetchOrganization, saveOrganization } from '$lib/api/settings';
	import {
		ORGANIZATION_LABEL,
		ORGANIZATION_DESC,
		ORG_IDENTITY_CARD_TITLE,
		ORG_NAME_LABEL,
		ORG_NAME_PLACEHOLDER,
		ORG_LOGO_URL_LABEL,
		ORG_LOGO_URL_HINT,
		ORG_LOGO_URL_PLACEHOLDER,
		ORG_LOGO_PREVIEW_ALT,
		ORG_SAVED_TOAST,
		saveOrgLabel
	} from '$lib/copy/settings';

	let form = { name: '', logoUrl: '' };
	let saving = false;

	onMount(async () => {
		try {
			const org = await fetchOrganization();
			form = { name: org.name ?? '', logoUrl: org.logoUrl ?? '' };
		} catch {}
	});

	async function handleSave() {
		saving = true;
		try {
			const org = await saveOrganization({ name: form.name, logoUrl: form.logoUrl });
			form = { name: org.name ?? '', logoUrl: org.logoUrl ?? '' };
			patchBranding({ name: form.name, logoUrl: form.logoUrl });
			notify('success', ORG_SAVED_TOAST);
		} catch (e) {
			notify('error', e.message);
		} finally {
			saving = false;
		}
	}
</script>

<div class="content-header">
	<h2>{ORGANIZATION_LABEL}</h2>
	<p class="content-desc">{ORGANIZATION_DESC}</p>
</div>

<div class="card settings-card">
	<p class="card-title">{ORG_IDENTITY_CARD_TITLE}</p>
	<div class="field">
		<label class="field-label" for="org-name">{ORG_NAME_LABEL}</label>
		<input
			id="org-name"
			type="text"
			class="field-input"
			bind:value={form.name}
			placeholder={ORG_NAME_PLACEHOLDER}
		/>
	</div>
	<div class="field">
		<label class="field-label" for="org-logo">
			<span>{ORG_LOGO_URL_LABEL}</span>
			<span class="field-hint">{ORG_LOGO_URL_HINT}</span>
		</label>
		<input
			id="org-logo"
			type="url"
			class="field-input"
			bind:value={form.logoUrl}
			placeholder={ORG_LOGO_URL_PLACEHOLDER}
		/>
	</div>
	{#if form.logoUrl.trim()}
		<img
			class="logo-preview"
			src={form.logoUrl}
			alt={ORG_LOGO_PREVIEW_ALT}
			on:error={(e) => (e.currentTarget.hidden = true)}
			on:load={(e) => (e.currentTarget.hidden = false)}
		/>
	{/if}
	<div class="card-footer">
		<Button on:click={handleSave} disabled={saving}>{saveOrgLabel(saving)}</Button>
	</div>
</div>

<style>
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
	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
		padding-top: 0.5rem;
	}
	.logo-preview {
		align-self: flex-start;
		max-height: 44px;
		max-width: 200px;
		object-fit: contain;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.6rem;
		background: var(--bg-subtle);
	}
</style>
