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
	import { auth } from '$lib/stores/auth';
	import { login } from '$lib/api/auth';
	import { theme } from '$lib/stores/theme';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			const { token, user } = await login({ email, password });
			auth.login(token, user);
			window.location.href = '/';
		} catch (e) {
			error = e.message || 'Login failed';
		} finally {
			loading = false;
		}
	}

	function onKeydown(e) {
		if (e.key === 'Enter') handleSubmit();
	}
</script>

<svelte:head><title>Sign in — Plum</title></svelte:head>

<div class="page" data-theme={$theme}>
	<div class="card">
		<div class="brand">
			<span class="brand-serif">Pl</span><span class="brand-sans">um</span>
		</div>
		<h1 class="title">Sign in</h1>
		<p class="subtitle">Access your test workspace</p>

		<div class="fields">
			<div class="field">
				<label class="label" for="email">Email</label>
				<input
					id="email"
					type="email"
					class="input"
					bind:value={email}
					placeholder="jane@example.com"
					autocomplete="email"
					on:keydown={onKeydown}
				/>
			</div>
			<div class="field">
				<label class="label" for="password">Password</label>
				<input
					id="password"
					type="password"
					class="input"
					bind:value={password}
					placeholder="••••••••"
					autocomplete="current-password"
					on:keydown={onKeydown}
				/>
			</div>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button class="submit-btn" on:click={handleSubmit} disabled={loading || !email || !password}>
			{loading ? 'Signing in…' : 'Sign in'}
		</button>
	</div>
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
		color: #fff;
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
