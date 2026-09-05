<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setup, checkNeedsSetup } from '$lib/api/auth';
	import { importBackup } from '$lib/api/settings';
	import { auth } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import { FRAMEWORKS } from '$lib/constants';
	import { frameworkLabel } from '$lib/copy/settings';
	import IconSelect from '$lib/components/ui/IconSelect.svelte';
	import { EMAIL_LABEL, PASSWORD_LABEL } from '$lib/copy/common';
	import {
		CHECKING_SERVER,
		EMAIL_PLACEHOLDER,
		SETUP_PAGE_TITLE,
		YOUR_NAME_LABEL,
		NAME_PLACEHOLDER,
		PASSWORD_MIN_PLACEHOLDER,
		ALL_FIELDS_REQUIRED,
		PASSWORD_MIN_LENGTH_ERROR,
		SETUP_FAILED_FALLBACK,
		SETUP_STEP_ORG_TITLE,
		SETUP_STEP_ORG_SUBTITLE,
		SETUP_STEP_ADMIN_TITLE,
		SETUP_STEP_ADMIN_SUBTITLE,
		ORG_NAME_LABEL,
		ORG_NAME_PLACEHOLDER,
		PROJECT_NAME_LABEL,
		PROJECT_NAME_PLACEHOLDER,
		SETUP_FRAMEWORK_LABEL,
		SETUP_FRAMEWORK_HINT,
		SETUP_CONTINUE_LABEL,
		SETUP_BACK_LABEL,
		setupStepLabel,
		createAccountLabel,
		RESTORE_INSTEAD_LABEL,
		RESTORE_TITLE,
		RESTORE_SUBTITLE,
		RESTORE_FILE_LABEL,
		RESTORE_FILE_REQUIRED_ERROR,
		INVALID_BACKUP_FILE_ERROR,
		RESTORE_FAILED_FALLBACK,
		restoreButtonLabel
	} from '$lib/copy/auth';
	import {
		TERMS_HEADING,
		TERMS_INTRO,
		TERMS_SECTIONS,
		TERMS_AGREE_LABEL,
		TERMS_REQUIRED_ERROR
	} from '$lib/copy/legal';

	let step = 1;
	let organizationName = '';
	let projectName = '';
	let framework = FRAMEWORKS[0];
	const frameworkOptions = FRAMEWORKS.map((id) => ({ id, label: frameworkLabel(id) }));
	let name = '';
	let email = '';
	let password = '';
	let termsAccepted = false;
	let error = '';
	let loading = false;
	let checking = true;

	let mode = 'setup'; // 'setup' | 'restore'
	let restoreFile = null;
	let restoreError = '';
	let restoring = false;

	$: step1Ready = organizationName.trim() && projectName.trim();
	$: step2Ready = name.trim() && email.trim() && password && termsAccepted;

	onMount(async () => {
		try {
			if (!(await checkNeedsSetup())) goto('/login');
		} catch {}
		checking = false;
	});

	function next() {
		if (!step1Ready) {
			error = ALL_FIELDS_REQUIRED;
			return;
		}
		error = '';
		step = 2;
	}

	async function handleSubmit() {
		if (!name.trim() || !email.trim() || !password) {
			error = ALL_FIELDS_REQUIRED;
			return;
		}
		if (password.length < 8) {
			error = PASSWORD_MIN_LENGTH_ERROR;
			return;
		}
		if (!termsAccepted) {
			error = TERMS_REQUIRED_ERROR;
			return;
		}
		error = '';
		loading = true;
		try {
			const { token, user } = await setup({
				organizationName,
				projectName,
				framework,
				name,
				email,
				password,
				termsAccepted
			});
			auth.login(token, user);
			window.location.href = '/';
		} catch (e) {
			error = e.message || SETUP_FAILED_FALLBACK;
		} finally {
			loading = false;
		}
	}

	async function handleRestore() {
		if (!restoreFile) {
			restoreError = RESTORE_FILE_REQUIRED_ERROR;
			return;
		}
		restoreError = '';
		restoring = true;
		try {
			let data;
			try {
				data = JSON.parse(await restoreFile.text());
			} catch {
				throw new Error(INVALID_BACKUP_FILE_ERROR);
			}
			const result = await importBackup(data);
			if (result?.error) throw new Error(result.error);
			// The file's own owner account exists now, this page 404s from here.
			window.location.href = '/login';
		} catch (e) {
			restoreError = e.message || RESTORE_FAILED_FALLBACK;
		} finally {
			restoring = false;
		}
	}
</script>

<svelte:head><title>{SETUP_PAGE_TITLE}</title></svelte:head>

<div class="page" data-theme={$theme}>
	{#if checking}
		<p class="checking">{CHECKING_SERVER}</p>
	{:else}
		<div class="card">
			<div class="brand">
				<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
			</div>

			<div class="heading">
				{#if mode !== 'restore'}
					<span class="step-label">{setupStepLabel(step, 2)}</span>
				{/if}
				<h1 class="title">
					{mode === 'restore'
						? RESTORE_TITLE
						: step === 1
							? SETUP_STEP_ORG_TITLE
							: SETUP_STEP_ADMIN_TITLE}
				</h1>
				<p class="subtitle">
					{mode === 'restore'
						? RESTORE_SUBTITLE
						: step === 1
							? SETUP_STEP_ORG_SUBTITLE
							: SETUP_STEP_ADMIN_SUBTITLE}
				</p>
			</div>

			{#if mode === 'restore'}
				<div class="fields">
					<div class="field">
						<label class="label" for="restore-file">{RESTORE_FILE_LABEL}</label>
						<input
							id="restore-file"
							type="file"
							accept="application/json"
							class="file-input"
							on:change={(e) => (restoreFile = e.currentTarget.files?.[0] ?? null)}
						/>
					</div>
				</div>

				{#if restoreError}<p class="error">{restoreError}</p>{/if}

				<div class="actions">
					<button
						class="ghost-btn"
						on:click={() => {
							mode = 'setup';
							restoreError = '';
						}}
						disabled={restoring}
					>
						{SETUP_BACK_LABEL}
					</button>
					<button class="submit-btn" on:click={handleRestore} disabled={restoring || !restoreFile}>
						{restoreButtonLabel(restoring)}
					</button>
				</div>
			{:else if step === 1}
				<div class="fields">
					<div class="field">
						<label class="label" for="org">{ORG_NAME_LABEL}</label>
						<input
							id="org"
							class="input"
							bind:value={organizationName}
							placeholder={ORG_NAME_PLACEHOLDER}
						/>
					</div>
					<div class="field">
						<label class="label" for="project">{PROJECT_NAME_LABEL}</label>
						<input
							id="project"
							class="input"
							bind:value={projectName}
							placeholder={PROJECT_NAME_PLACEHOLDER}
						/>
					</div>
					<div class="field">
						<span class="label">{SETUP_FRAMEWORK_LABEL}</span>
						<IconSelect
							options={frameworkOptions}
							value={framework}
							ariaLabel={SETUP_FRAMEWORK_LABEL}
							fullWidth
							on:change={(e) => (framework = e.detail)}
						/>
						<p class="hint">{SETUP_FRAMEWORK_HINT}</p>
					</div>
				</div>

				{#if error}<p class="error">{error}</p>{/if}

				<button class="submit-btn" on:click={next} disabled={!step1Ready}>
					{SETUP_CONTINUE_LABEL}
				</button>
				<button class="link-btn" type="button" on:click={() => (mode = 'restore')}>
					{RESTORE_INSTEAD_LABEL}
				</button>
			{:else}
				<div class="fields">
					<div class="field">
						<label class="label" for="name">{YOUR_NAME_LABEL}</label>
						<input
							id="name"
							class="input"
							bind:value={name}
							placeholder={NAME_PLACEHOLDER}
							autocomplete="name"
						/>
					</div>
					<div class="field">
						<label class="label" for="email">{EMAIL_LABEL}</label>
						<input
							id="email"
							type="email"
							class="input"
							bind:value={email}
							placeholder={EMAIL_PLACEHOLDER}
							autocomplete="email"
						/>
					</div>
					<div class="field">
						<label class="label" for="password">{PASSWORD_LABEL}</label>
						<input
							id="password"
							type="password"
							class="input"
							bind:value={password}
							placeholder={PASSWORD_MIN_PLACEHOLDER}
							autocomplete="new-password"
						/>
					</div>
				</div>

				<div class="terms">
					<p class="terms-title">{TERMS_HEADING}</p>
					<div class="terms-box">
						<p>{TERMS_INTRO}</p>
						{#each TERMS_SECTIONS as section}
							<p><strong>{section.h}.</strong> {section.p}</p>
						{/each}
					</div>
					<label class="terms-check">
						<input type="checkbox" bind:checked={termsAccepted} />
						<span>{TERMS_AGREE_LABEL}</span>
					</label>
				</div>

				{#if error}<p class="error">{error}</p>{/if}

				<div class="actions">
					<button class="ghost-btn" on:click={() => (step = 1)} disabled={loading}>
						{SETUP_BACK_LABEL}
					</button>
					<button class="submit-btn" on:click={handleSubmit} disabled={loading || !step2Ready}>
						{createAccountLabel(loading)}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.page {
		min-height: 100vh;
		background: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.checking {
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.card {
		width: 100%;
		max-width: 400px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 2.5rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.brand {
		font-size: 1.5rem;
		letter-spacing: -0.02em;
		margin-bottom: -0.25rem;
	}
	.brand-serif {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--accent);
	}
	.brand-sans {
		font-family: var(--font-body);
		font-weight: 400;
		color: var(--text);
	}

	.heading {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.step-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
	}
	.title {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}
	.subtitle {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 0;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}
	.hint {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.input {
		height: 38px;
		padding: 0 0.75rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		outline: none;
		transition: border-color var(--duration-fast);
	}
	.input:focus {
		border-color: var(--accent);
	}
	.file-input {
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text);
	}

	.error {
		font-size: 0.8125rem;
		color: var(--fail);
		margin: -0.25rem 0 0;
	}

	.terms {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.terms-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
		margin: 0;
	}
	.terms-box {
		max-height: 160px;
		overflow-y: auto;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.terms-box p {
		margin: 0 0 0.6rem;
	}
	.terms-box p:last-child {
		margin-bottom: 0;
	}
	.terms-box strong {
		color: var(--text);
		font-weight: 600;
	}
	.terms-check {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text);
		cursor: pointer;
	}
	.terms-check input {
		margin-top: 0.15rem;
		accent-color: var(--accent);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.submit-btn {
		flex: 1;
		width: 100%;
		min-height: 44px;
		padding: 0.7rem 1rem;
		background: var(--accent);
		color: var(--white);
		border: none;
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity var(--duration-fast);
	}
	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.submit-btn:not(:disabled):hover {
		opacity: 0.88;
	}

	.ghost-btn {
		min-height: 44px;
		padding: 0 1rem;
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-family: var(--font-body);
		font-size: 0.875rem;
		cursor: pointer;
	}
	.ghost-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
		text-align: center;
	}
	.link-btn:hover {
		color: var(--text);
	}
</style>
