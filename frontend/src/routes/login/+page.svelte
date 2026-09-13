<!--
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 -->

<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth';
	import { login, checkNeedsSetup, fetchBranding, fetchMe } from '$lib/api/auth';
	import { API_BASE } from '$lib/constants';
	import { theme } from '$lib/stores/theme';
	import { EMAIL_LABEL, PASSWORD_LABEL } from '$lib/copy/common';
	import {
		CHECKING_SERVER,
		EMAIL_PLACEHOLDER,
		LOGIN_PAGE_TITLE,
		SIGN_IN_TITLE,
		SIGN_IN_SUBTITLE,
		PASSWORD_PLACEHOLDER,
		LOGIN_FAILED_FALLBACK,
		LOGIN_METHOD_DIVIDER,
		GOOGLE_SIGN_IN_LABEL,
		POWERED_BY_LABEL,
		signInLabel
	} from '$lib/copy/auth';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;
	let checking = true;
	let branding = null;

	$: passwordLogin = branding?.passwordLoginEnabled ?? true;
	$: googleLogin = branding?.googleLoginEnabled ?? false;
	$: googleHref = `${API_BASE}/auth/google?origin=${encodeURIComponent(
		typeof location !== 'undefined' ? location.origin : ''
	)}`;

	// The Google callback bounces back here with the result in the URL fragment.
	async function consumeOAuthResult() {
		const hash = new URLSearchParams(location.hash.slice(1));
		const token = hash.get('token');
		const oauthError = hash.get('error');
		history.replaceState(null, '', location.pathname);
		if (oauthError) {
			error = oauthError;
			return false;
		}
		if (!token) return false;
		try {
			const user = await fetchMe(token);
			auth.login(token, user);
			window.location.href = '/';
			return true;
		} catch {
			error = LOGIN_FAILED_FALLBACK;
			return false;
		}
	}

	onMount(async () => {
		if (location.hash.includes('token=') || location.hash.includes('error=')) {
			if (await consumeOAuthResult()) return;
		}
		try {
			if (await checkNeedsSetup()) {
				goto('/setup');
				return;
			}
		} catch {}
		branding = await fetchBranding();
		checking = false;
	});

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			const { token, user } = await login({ email, password });
			auth.login(token, user);
			window.location.href = '/';
		} catch (e) {
			error = e.message || LOGIN_FAILED_FALLBACK;
		} finally {
			loading = false;
		}
	}

	function onKeydown(e) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<svelte:head><title>{LOGIN_PAGE_TITLE}</title></svelte:head>

<div class="page" data-theme={$theme}>
	{#if checking}
		<p class="checking">{CHECKING_SERVER}</p>
	{:else}
		<div class="card">
			{#if branding?.logoUrl}
				<img class="org-logo" src={branding.logoUrl} alt={branding.name || 'Organization logo'} />
			{:else}
				<div class="brand">
					<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
				</div>
			{/if}
			<h1 class="title">{branding?.name || SIGN_IN_TITLE}</h1>
			<p class="subtitle">{SIGN_IN_SUBTITLE}</p>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			{#if passwordLogin}
				<div class="fields">
					<div class="field">
						<label class="label" for="email">{EMAIL_LABEL}</label>
						<input
							id="email"
							type="email"
							class="input"
							bind:value={email}
							placeholder={EMAIL_PLACEHOLDER}
							autocomplete="email"
							on:keydown={onKeydown}
						/>
					</div>
					<div class="field">
						<label class="label" for="password">{PASSWORD_LABEL}</label>
						<input
							id="password"
							type="password"
							class="input"
							bind:value={password}
							placeholder={PASSWORD_PLACEHOLDER}
							autocomplete="current-password"
							on:keydown={onKeydown}
						/>
					</div>
				</div>

				<button
					class="submit-btn"
					on:click={handleSubmit}
					disabled={loading || !email || !password}
				>
					{signInLabel(loading)}
				</button>
			{/if}

			{#if passwordLogin && googleLogin}
				<div class="divider"><span>{LOGIN_METHOD_DIVIDER}</span></div>
			{/if}

			{#if googleLogin}
				<a class="google-btn" href={googleHref}>
					<svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						<path
							fill="#4285F4"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="#34A853"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"
						/>
						<path
							fill="#FBBC05"
							d="M5.85 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.67-2.84z"
						/>
						<path
							fill="#EA4335"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.67 2.84C6.71 7.3 9.14 5.38 12 5.38z"
						/>
					</svg>
					{GOOGLE_SIGN_IN_LABEL}
				</a>
			{/if}

			{#if branding?.logoUrl}
				<p class="powered-by">
					{POWERED_BY_LABEL}
					<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
				</p>
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
		max-width: 380px;
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

	.org-logo {
		align-self: center;
		max-height: 44px;
		max-width: 200px;
		object-fit: contain;
		margin-bottom: -0.25rem;
	}

	.powered-by {
		margin: -0.25rem 0 0;
		font-size: 0.75rem;
		letter-spacing: -0.01em;
		color: var(--text-muted);
	}
	.powered-by .brand-serif,
	.powered-by .brand-sans {
		font-size: 0.8125rem;
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

	.title {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}

	.subtitle {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: -0.75rem 0 0;
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

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: -0.25rem 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.google-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: background var(--duration-fast);
	}
	.google-btn:hover {
		background: var(--bg-subtle);
	}
	.google-icon {
		flex-shrink: 0;
	}
</style>
