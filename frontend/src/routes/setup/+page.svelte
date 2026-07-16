<!--
 * This file is part of Plum.
 *
 * Plum is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Plum is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Plum. If not, see https://www.gnu.org/licenses/.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { setup, checkNeedsSetup } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth';
	import { login as apiLogin } from '$lib/api/auth';
	import { theme } from '$lib/stores/theme';
	import { EMAIL_LABEL, PASSWORD_LABEL } from '$lib/copy/common';
	import {
		CHECKING_SERVER,
		EMAIL_PLACEHOLDER,
		SETUP_PAGE_TITLE,
		WELCOME_TITLE,
		WELCOME_SUBTITLE,
		YOUR_NAME_LABEL,
		NAME_PLACEHOLDER,
		PASSWORD_MIN_PLACEHOLDER,
		ALL_FIELDS_REQUIRED,
		PASSWORD_MIN_LENGTH_ERROR,
		SETUP_FAILED_FALLBACK,
		createAccountLabel
	} from '$lib/copy/auth';

	let name = '';
	let email = '';
	let password = '';
	let error = '';
	let loading = false;
	let checking = true;

	onMount(async () => {
		try {
			const needs = await checkNeedsSetup();
			if (!needs) goto('/login');
		} catch {}
		checking = false;
	});

	async function handleSubmit() {
		if (!name || !email || !password) {
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
			await setup({ name, email, password });
			const { token, user } = await apiLogin({ email, password });
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
				<h1 class="title">{WELCOME_TITLE}</h1>
				<p class="subtitle">{WELCOME_SUBTITLE}</p>
			</div>

			<div class="fields">
				<div class="field">
					<label class="label" for="name">{YOUR_NAME_LABEL}</label>
					<input
						id="name"
						type="text"
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

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button
				class="submit-btn"
				on:click={handleSubmit}
				disabled={loading || !name || !email || !password}
			>
				{createAccountLabel(loading)}
			</button>
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

	.submit-btn {
		height: 40px;
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
</style>
