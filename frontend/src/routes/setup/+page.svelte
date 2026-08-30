<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setup, checkNeedsSetup } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
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
		SETUP_CONTINUE_LABEL,
		SETUP_BACK_LABEL,
		setupStepLabel,
		createAccountLabel
	} from '$lib/copy/auth';

	let step = 1;
	let organizationName = '';
	let projectName = '';
	let name = '';
	let email = '';
	let password = '';
	let error = '';
	let loading = false;
	let checking = true;

	$: step1Ready = organizationName.trim() && projectName.trim();
	$: step2Ready = name.trim() && email.trim() && password;

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
		if (!step2Ready) {
			error = ALL_FIELDS_REQUIRED;
			return;
		}
		if (password.length < 8) {
			error = PASSWORD_MIN_LENGTH_ERROR;
			return;
		}
		error = '';
		loading = true;
		try {
			const { token, user } = await setup({ organizationName, projectName, name, email, password });
			auth.login(token, user);
			window.location.href = '/';
		} catch (e) {
			error = e.message || SETUP_FAILED_FALLBACK;
		} finally {
			loading = false;
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
				<span class="step-label">{setupStepLabel(step, 2)}</span>
				<h1 class="title">{step === 1 ? SETUP_STEP_ORG_TITLE : SETUP_STEP_ADMIN_TITLE}</h1>
				<p class="subtitle">{step === 1 ? SETUP_STEP_ORG_SUBTITLE : SETUP_STEP_ADMIN_SUBTITLE}</p>
			</div>

			{#if step === 1}
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
				</div>

				{#if error}<p class="error">{error}</p>{/if}

				<button class="submit-btn" on:click={next} disabled={!step1Ready}>
					{SETUP_CONTINUE_LABEL}
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

	.error {
		font-size: 0.8125rem;
		color: var(--fail);
		margin: -0.25rem 0 0;
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
</style>
