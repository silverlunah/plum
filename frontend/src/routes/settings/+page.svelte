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
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import {
		fetchProject,
		saveProject,
		exportBackup,
		importBackup,
		fetchIntegrations,
		saveIntegrations,
		fetchBackupConfig,
		saveBackupConfig,
		testBackupS3,
		runBackupNow,
		fetchMcpConfig,
		generateMcpKey as generateMcpKeyApi
	} from '$lib/api/settings';
	import {
		fetchRunners,
		createRunner,
		updateRunner,
		deleteRunner,
		pingRunner,
		probeRunner
	} from '$lib/api/runners';
	import { fetchPrefixes, savePrefixes, migratePrefixes } from '$lib/api/repository';
	import { updateProfile, changePassword } from '$lib/api/auth';
	import {
		fetchUsers,
		createUser as createUserApi,
		deleteUser as deleteUserApi
	} from '$lib/api/users';
	import { builtInEnabled } from '$lib/stores/runner';
	import { auth } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import { API_BASE, BROWSERS, TOAST_TIMEOUT_MS } from '$lib/constants';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	/** @type {'project' | 'runners' | 'repository' | 'integrations' | 'mcp' | 'account' | 'users' | 'backup'} */
	let section =
		(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('plum:settings:section')) ||
		'project';

	function setSection(s) {
		section = s;
		try {
			sessionStorage.setItem('plum:settings:section', s);
		} catch {}
	}

	let project = { name: '', logoUrl: '', timezone: 'UTC' };
	let projectSaving = false;
	let toast = null;

	const TIMEZONES = (() => {
		try {
			return Intl.supportedValuesOf('timeZone');
		} catch {
			return ['UTC'];
		}
	})();

	let prefixes = { testCasePrefix: 'TC', testSuitePrefix: 'TS' };
	let prefixesSaving = false;
	let migrateForm = { testCasePrefix: '', testSuitePrefix: '' };
	let migrating = false;

	let profileForm = { name: '', email: '' };
	let profileSaving = false;
	let profileError = '';

	let allUsers = [];
	let userForm = { name: '', email: '', password: '', role: 'user' };
	let userFormSaving = false;
	let userFormError = '';
	let confirmDeleteUser = null;
	let confirmDeleteUserOpen = false;

	let pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
	let pwSaving = false;
	let pwError = '';

	let importFile = null;
	let importing = false;
	let exporting = false;
	let fileInput;

	let integrations = { discordWebhookUrl: '', slackWebhookUrl: '', notifyPublicUrl: '' };
	let integrationsSaving = false;

	let mcpKey = '';
	let mcpKeySet = false;
	let mcpShowKey = false;
	let mcpGenerating = false;
	let mcpKeyCopied = false;
	let mcpSnippetCopied = false;
	let ciSnippetCopied = false;

	let backupConfig = {
		backupEnabled: false,
		backupCron: '0 2 * * *',
		backupS3Endpoint: '',
		backupS3Region: '',
		backupS3Bucket: '',
		backupS3AccessKey: '',
		backupS3SecretKey: '',
		backupS3Prefix: ''
	};
	let backupConfigSaving = false;
	let backupS3SecretKeySet = false;
	let backupTestingS3 = false;
	let backupRunningNow = false;
	let backupS3TestResult = null;
	let backupS3TestMessage = '';
	let backupLastRunAt = null;
	let backupLastStatus = '';

	let runners = [];
	let runnerForm = { name: '', url: '', token: '', browser: 'chromium' };
	let runnerFormError = '';
	let runnerFormSaving = false;
	let runnerFormOpen = false;
	let pingResults = {};
	let editingId = null;
	let editForm = { name: '', url: '', token: '', browser: 'chromium' };
	let editFormError = '';
	let editFormSaving = false;

	function showToast(type, message) {
		toast = { type, message };
		setTimeout(() => (toast = null), TOAST_TIMEOUT_MS);
	}

	let runnersLoaded = false;

	onMount(async () => {
		try {
			const bi = localStorage.getItem('plum:builtInEnabled');
			if (bi !== null) builtInEnabled.set(bi !== 'false');
		} catch {}
		try {
			project = await fetchProject();
		} catch {}
		try {
			runners = await fetchRunners();
			runnersLoaded = true;
		} catch {}
		try {
			prefixes = await fetchPrefixes();
			migrateForm = {
				testCasePrefix: prefixes.testCasePrefix,
				testSuitePrefix: prefixes.testSuitePrefix
			};
		} catch {}
		try {
			integrations = await fetchIntegrations();
		} catch {}
		try {
			const mcp = await fetchMcpConfig();
			mcpKeySet = mcp.mcpKeySet;
			mcpKey = mcp.mcpKey;
		} catch {}
		try {
			const bc = await fetchBackupConfig();
			backupS3SecretKeySet = bc.backupS3SecretKeySet;
			backupLastRunAt = bc.backupLastRunAt;
			backupLastStatus = bc.backupLastStatus;
			backupConfig = {
				backupEnabled: bc.backupEnabled,
				backupCron: bc.backupCron,
				backupS3Endpoint: bc.backupS3Endpoint,
				backupS3Region: bc.backupS3Region,
				backupS3Bucket: bc.backupS3Bucket,
				backupS3AccessKey: bc.backupS3AccessKey,
				backupS3SecretKey: '',
				backupS3Prefix: bc.backupS3Prefix
			};
		} catch {}
		if ($auth.user) {
			profileForm = { name: $auth.user.name, email: $auth.user.email };
		}
		if ($auth.user?.role === 'admin') {
			try {
				allUsers = await fetchUsers();
			} catch {}
		}
	});

	$: if (section === 'runners' && runnersLoaded) pingAll();

	async function pingAll() {
		if (runners.length === 0) return;
		pingResults = Object.fromEntries(runners.map((r) => [r.id, { loading: true }]));
		await Promise.all(
			runners.map(async (r) => {
				try {
					const result = await pingRunner(r.id);
					pingResults = { ...pingResults, [r.id]: { ...result, loading: false } };
				} catch {
					pingResults = {
						...pingResults,
						[r.id]: { ok: false, error: 'Network error', loading: false }
					};
				}
			})
		);
	}

	function handleBuiltInToggle() {
		builtInEnabled.update((v) => {
			const next = !v;
			try {
				localStorage.setItem('plum:builtInEnabled', String(next));
			} catch {}
			return next;
		});
	}

	function toggleTheme() {
		theme.update((t) => (t === 'light' ? 'dark' : 'light'));
	}

	async function handleAddRunner() {
		if (!runnerForm.name || !runnerForm.url || !runnerForm.token) {
			runnerFormError = 'Name, URL and token are required.';
			return;
		}
		runnerFormError = '';
		runnerFormSaving = true;
		try {
			const probe = await probeRunner(runnerForm.url, runnerForm.token);
			if (!probe.ok) {
				runnerFormError = `Cannot reach this runner — ${probe.error ?? 'check the URL and token'}.`;
				return;
			}
			const { runner } = await createRunner(runnerForm);
			runners = [...runners, runner];
			pingResults = {
				...pingResults,
				[runner.id]: { ok: true, latency: probe.latency, loading: false }
			};
			runnerForm = { name: '', url: '', token: '', browser: 'chromium' };
			runnerFormOpen = false;
			showToast('success', `Runner "${runner.name}" added.`);
		} catch {
			runnerFormError = 'Failed to add runner.';
		} finally {
			runnerFormSaving = false;
		}
	}

	async function handleDeleteRunner(id, name) {
		try {
			await deleteRunner(id);
			runners = runners.filter((r) => r.id !== id);
			showToast('success', `Runner "${name}" removed.`);
		} catch {
			showToast('error', 'Failed to remove runner.');
		}
	}

	function startEdit(r) {
		editingId = r.id;
		editForm = { name: r.name, url: r.url, token: r.token, browser: r.browser };
		editFormError = '';
	}

	async function handleUpdateRunner(id) {
		if (!editForm.name || !editForm.url || !editForm.token) {
			editFormError = 'Name, URL and token are required.';
			return;
		}
		editFormError = '';
		editFormSaving = true;
		try {
			const probe = await probeRunner(editForm.url, editForm.token);
			if (!probe.ok) {
				editFormError = `Cannot reach this runner — ${probe.error ?? 'check the URL and token'}.`;
				return;
			}
			const { runner } = await updateRunner(id, editForm);
			runners = runners.map((r) => (r.id === id ? runner : r));
			pingResults = { ...pingResults, [id]: { ok: true, latency: probe.latency, loading: false } };
			editingId = null;
			showToast('success', `Runner "${runner.name}" updated.`);
		} catch {
			editFormError = 'Failed to update runner.';
		} finally {
			editFormSaving = false;
		}
	}

	async function handleSaveProject() {
		projectSaving = true;
		try {
			await saveProject(project);
			showToast('success', 'Project settings saved.');
		} catch {
			showToast('error', 'Failed to save project settings.');
		} finally {
			projectSaving = false;
		}
	}

	async function handleExport() {
		exporting = true;
		try {
			const data = await exportBackup();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `plum-backup-${new Date().toISOString().slice(0, 10)}.json`;
			a.click();
			URL.revokeObjectURL(url);
			showToast('success', 'Backup downloaded.');
		} catch {
			showToast('error', 'Export failed.');
		} finally {
			exporting = false;
		}
	}

	async function handleImport() {
		if (!importFile) return;
		importing = true;
		try {
			const text = await importFile.text();
			const data = JSON.parse(text);
			const result = await importBackup(data);
			if (result.error) throw new Error(result.error);
			showToast('success', 'Import successful. Cron jobs have been re-scheduled.');
			project = await fetchProject();
			importFile = null;
			if (fileInput) fileInput.value = '';
		} catch (e) {
			showToast('error', e.message || 'Import failed. Check the file format.');
		} finally {
			importing = false;
		}
	}

	function handleFileChange(e) {
		importFile = e.target.files[0] ?? null;
	}

	async function handleSavePrefixes() {
		prefixesSaving = true;
		try {
			prefixes = await savePrefixes(prefixes);
			showToast('success', 'Prefixes saved.');
		} catch {
			showToast('error', 'Failed to save prefixes.');
		} finally {
			prefixesSaving = false;
		}
	}

	async function handleMigratePrefixes() {
		migrating = true;
		try {
			await migratePrefixes(migrateForm);
			prefixes = { ...prefixes, ...migrateForm };
			showToast('success', 'Prefix migration complete. All IDs updated.');
		} catch {
			showToast('error', 'Migration failed.');
		} finally {
			migrating = false;
		}
	}

	async function handleUpdateProfile() {
		profileError = '';
		profileSaving = true;
		try {
			const { user } = await updateProfile({
				token: $auth.token,
				name: profileForm.name,
				email: profileForm.email
			});
			auth.login($auth.token, { ...$auth.user, ...user });
			showToast('success', 'Profile updated.');
		} catch (e) {
			profileError = e.message;
		} finally {
			profileSaving = false;
		}
	}

	async function handleCreateUser() {
		userFormError = '';
		if (!userForm.name || !userForm.email || !userForm.password) {
			userFormError = 'Name, email and password are required.';
			return;
		}
		userFormSaving = true;
		try {
			const user = await createUserApi(userForm);
			allUsers = [...allUsers, user];
			userForm = { name: '', email: '', password: '', role: 'user' };
			showToast('success', `User "${user.name}" added.`);
		} catch (e) {
			userFormError = e.message;
		} finally {
			userFormSaving = false;
		}
	}

	async function handleDeleteUser(id, name) {
		try {
			await deleteUserApi(id);
			allUsers = allUsers.filter((u) => u.id !== id);
			showToast('success', `User "${name}" removed.`);
		} catch (e) {
			showToast('error', e.message);
		}
		confirmDeleteUser = null;
		confirmDeleteUserOpen = false;
	}

	async function handleChangePassword() {
		pwError = '';
		if (pwForm.newPassword !== pwForm.confirmPassword) {
			pwError = 'Passwords do not match.';
			return;
		}
		if (pwForm.newPassword.length < 8) {
			pwError = 'Password must be at least 8 characters.';
			return;
		}
		pwSaving = true;
		try {
			await changePassword({
				token: $auth.token,
				currentPassword: pwForm.currentPassword,
				newPassword: pwForm.newPassword
			});
			pwForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
			showToast('success', 'Password changed.');
		} catch (e) {
			pwError = e.message;
		} finally {
			pwSaving = false;
		}
	}

	function handleLogout() {
		auth.logout();
		goto('/login');
	}

	async function handleGenerateMcpKey() {
		mcpGenerating = true;
		try {
			const result = await generateMcpKeyApi();
			mcpKey = result.mcpKey;
			mcpKeySet = true;
			mcpShowKey = true;
			showToast('success', 'MCP key generated.');
		} catch {
			showToast('error', 'Failed to generate MCP key.');
		} finally {
			mcpGenerating = false;
		}
	}

	function handleCopyMcpKey() {
		navigator.clipboard.writeText(mcpKey).then(() => {
			mcpKeyCopied = true;
			setTimeout(() => (mcpKeyCopied = false), 1500);
		});
	}

	function handleCopyMcpSnippet() {
		navigator.clipboard.writeText(mcpConfigSnippet).then(() => {
			mcpSnippetCopied = true;
			setTimeout(() => (mcpSnippetCopied = false), 1500);
		});
	}

	function handleCopyCiSnippet() {
		navigator.clipboard.writeText(ciWorkflowSnippet).then(() => {
			ciSnippetCopied = true;
			setTimeout(() => (ciSnippetCopied = false), 1500);
		});
	}

	async function handleSaveIntegrations() {
		integrationsSaving = true;
		try {
			integrations = await saveIntegrations(integrations);
			showToast('success', 'Integration settings saved.');
		} catch {
			showToast('error', 'Failed to save integration settings.');
		} finally {
			integrationsSaving = false;
		}
	}

	async function handleSaveBackupConfig() {
		backupConfigSaving = true;
		try {
			const payload = { ...backupConfig };
			if (!payload.backupS3SecretKey) delete payload.backupS3SecretKey;
			const result = await saveBackupConfig(payload);
			if (result.error) throw new Error(result.error);
			if (backupConfig.backupS3SecretKey) backupS3SecretKeySet = true;
			backupConfig = { ...backupConfig, backupS3SecretKey: '' };
			showToast('success', 'Backup configuration saved.');
		} catch (e) {
			showToast('error', e.message || 'Failed to save backup configuration.');
		} finally {
			backupConfigSaving = false;
		}
	}

	async function handleTestS3() {
		backupTestingS3 = true;
		backupS3TestResult = null;
		backupS3TestMessage = '';
		try {
			const result = await testBackupS3(backupConfig);
			if (result.error) throw new Error(result.error);
			backupS3TestResult = 'success';
			backupS3TestMessage = 'Connection successful.';
		} catch (e) {
			backupS3TestResult = 'error';
			backupS3TestMessage = e.message || 'Connection failed.';
		} finally {
			backupTestingS3 = false;
		}
	}

	async function handleRunBackupNow() {
		backupRunningNow = true;
		try {
			const result = await runBackupNow();
			if (result.error) throw new Error(result.error);
			backupLastRunAt = result.lastRunAt;
			backupLastStatus = result.lastStatus ?? '';
			showToast('success', 'Backup uploaded to S3 successfully.');
		} catch (e) {
			showToast('error', e.message || 'Backup failed. Check your S3 configuration.');
			const bc = await fetchBackupConfig().catch(() => null);
			if (bc) {
				backupLastRunAt = bc.backupLastRunAt;
				backupLastStatus = bc.backupLastStatus;
			}
		} finally {
			backupRunningNow = false;
		}
	}

	$: s3Configured = !!(
		backupConfig.backupS3Bucket &&
		backupConfig.backupS3AccessKey &&
		backupS3SecretKeySet
	);

	$: mcpConfigSnippet = JSON.stringify(
		{
			mcpServers: {
				plum: {
					command: 'plum',
					args: ['mcp'],
					env: {
						PLUM_API_URL: 'http://localhost:3001',
						PLUM_API_KEY: mcpKey
					}
				}
			}
		},
		null,
		2
	);

	$: ciWorkflowSnippet = [
		'- name: Run Plum tests',
		'  run: |',
		`    curl -X POST ${API_BASE}/trigger \\`,
		'      -H "Authorization: ApiKey ${{ secrets.PLUM_API_KEY }}" \\',
		'      -H "Content-Type: application/json" \\',
		'      -d \'{"tag": "@smoke", "baseUrl": "https://your-pr-preview-url"}\''
	].join('\n');

	const ADMIN_SECTIONS = new Set([
		'project',
		'runners',
		'repository',
		'integrations',
		'mcp',
		'users',
		'backup'
	]);

	$: if ($auth.user && $auth.user.role !== 'admin' && ADMIN_SECTIONS.has(section)) {
		section = 'account';
	}

	$: navItems =
		$auth.user?.role === 'admin'
			? [
					{ id: 'project', label: 'Project' },
					{ id: 'runners', label: 'Runners' },
					{ id: 'repository', label: 'Repository' },
					{ id: 'integrations', label: 'Integrations' },
					{ id: 'mcp', label: 'MCP' },
					{ id: 'account', label: 'Account' },
					{ id: 'users', label: 'Users' },
					{ id: 'backup', label: 'Backup' }
				]
			: [{ id: 'account', label: 'Account' }];
</script>

<svelte:head><title>Settings — Plum</title></svelte:head>

<Toast {toast} />

<div class="page-header">
	<h1>Settings</h1>
</div>

<div class="settings-layout">
	<!-- Left sidebar -->
	<aside class="settings-sidebar">
		<nav>
			{#each navItems as item}
				<button
					class="sidebar-item"
					class:active={section === item.id}
					on:click={() => setSection(item.id)}
				>
					{item.label}
				</button>
			{/each}
		</nav>
	</aside>

	<!-- Right content -->
	<div class="settings-content">
		<!-- PROJECT -->
		{#if section === 'project'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Project</h2>
					<p class="content-desc">Identity information shown across the UI</p>
				</div>

				<div class="card settings-card">
					<div class="field">
						<label class="field-label" for="project-name">Project Name</label>
						<input
							id="project-name"
							type="text"
							class="field-input"
							bind:value={project.name}
							placeholder="My Test Suite"
						/>
					</div>

					<div class="field">
						<label class="field-label" for="project-logo">
							<span>Logo URL</span>
							<span class="field-hint">Direct link to an image (PNG, SVG, JPG)</span>
						</label>
						<input
							id="project-logo"
							type="url"
							class="field-input"
							bind:value={project.logoUrl}
							placeholder="https://example.com/logo.png"
						/>
					</div>

					{#if project.logoUrl}
						<div class="logo-preview">
							<span class="preview-label">Preview</span>
							<img
								src={project.logoUrl}
								alt="Project logo preview"
								class="logo-img"
								on:error={(e) => (e.target.style.display = 'none')}
							/>
						</div>
					{/if}

					<div class="field">
						<label class="field-label" for="project-timezone">
							<span>Timezone</span>
							<span class="field-hint">Used to schedule cron jobs and backups</span>
						</label>
						<select id="project-timezone" class="field-input" bind:value={project.timezone}>
							{#each TIMEZONES as tz}
								<option value={tz}>{tz}</option>
							{/each}
						</select>
					</div>

					<!-- Dark mode toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">Dark mode</span>
							<span class="toggle-desc">Switch between light and dark appearance</span>
						</div>
						<button
							class="toggle-switch"
							class:on={$theme === 'dark'}
							role="switch"
							aria-checked={$theme === 'dark'}
							on:click={toggleTheme}
						>
							<span class="toggle-thumb"></span>
						</button>
					</div>

					<div class="card-footer">
						<Button on:click={handleSaveProject} disabled={projectSaving}>
							{projectSaving ? 'Saving…' : 'Save Project'}
						</Button>
					</div>
				</div>
			</div>

			<!-- RUNNERS -->
		{:else if section === 'runners'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Runners</h2>
					<p class="content-desc">
						Register self-hosted runner nodes to distribute tests across machines.
					</p>
				</div>

				<div class="card settings-card">
					<!-- Built-in runner toggle -->
					<div class="toggle-row">
						<div class="toggle-info">
							<span class="toggle-label">Built-in runner</span>
							<span class="toggle-desc">
								Use this server to run tests locally. Disable to route all runs to external nodes.
							</span>
						</div>
						<button
							class="toggle-switch"
							class:on={$builtInEnabled}
							role="switch"
							aria-checked={$builtInEnabled}
							on:click={handleBuiltInToggle}
						>
							<span class="toggle-thumb"></span>
						</button>
					</div>

					<!-- External runner cards -->
					{#if runners.length > 0}
						<div class="runner-cards">
							{#each runners as r (r.id)}
								{@const ping = pingResults[r.id]}
								{#if editingId === r.id}
									<div class="runner-card editing" transition:fly={{ y: -4, duration: 180 }}>
										<div class="runner-form-fields">
											<div class="field">
												<label class="field-label" for="edit-name-{r.id}">Name</label>
												<input
													id="edit-name-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.name}
													placeholder="staging-node"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-url-{r.id}">
													URL
													<span class="field-hint"
														>Use <code>host.docker.internal</code> for local nodes</span
													>
												</label>
												<input
													id="edit-url-{r.id}"
													type="url"
													class="field-input"
													bind:value={editForm.url}
													placeholder="http://host.docker.internal:3002"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-token-{r.id}">Token</label>
												<input
													id="edit-token-{r.id}"
													type="text"
													class="field-input"
													bind:value={editForm.token}
													placeholder="secret-token"
													spellcheck="false"
													autocomplete="off"
												/>
											</div>
											<div class="field">
												<label class="field-label" for="edit-browser-{r.id}">Browser</label>
												<select
													id="edit-browser-{r.id}"
													class="field-input"
													bind:value={editForm.browser}
												>
													{#each BROWSERS as b}
														<option value={b.id}>{b.label}</option>
													{/each}
												</select>
											</div>
										</div>
										{#if editFormError}
											<p class="form-error">{editFormError}</p>
										{/if}
										<div class="runner-form-actions">
											<Button on:click={() => handleUpdateRunner(r.id)} disabled={editFormSaving}>
												{editFormSaving ? 'Checking…' : 'Save'}
											</Button>
											<Button
												variant="ghost"
												on:click={() => {
													editingId = null;
													editFormError = '';
												}}
												disabled={editFormSaving}>Cancel</Button
											>
										</div>
									</div>
								{:else}
									<div class="runner-card" transition:fly={{ y: -4, duration: 180 }}>
										<div class="runner-card-header">
											<svg
												class="runner-card-icon"
												width="13"
												height="13"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
												stroke-linecap="round"
											>
												<rect x="2" y="3" width="20" height="14" rx="2" />
												<path d="M8 21h8M12 17v4" />
											</svg>
											<span class="runner-card-name">{r.name}</span>
											<span class="runner-browser-pill">{r.browser}</span>
											{#if ping && !ping.loading}
												{#if ping.ok}
													<span class="ping-badge ok">{ping.latency}ms</span>
												{:else}
													<span class="ping-badge fail" title={ping.error}>unreachable</span>
												{/if}
											{:else if ping?.loading}
												<span class="ping-badge pinging">pinging…</span>
											{/if}
										</div>
										<p class="runner-card-url">{r.url}</p>
										<div class="runner-card-actions">
											<Button variant="ghost" size="sm" on:click={() => startEdit(r)}>Edit</Button>
											<Button
												variant="danger"
												size="sm"
												on:click={() => handleDeleteRunner(r.id, r.name)}>Remove</Button
											>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Add runner form / button -->
					{#if runnerFormOpen}
						<div class="runner-form" transition:fly={{ y: -6, duration: 200 }}>
							<p class="runner-form-title">Add runner</p>
							<div class="runner-form-fields">
								<div class="field">
									<label class="field-label" for="rn-name">Name</label>
									<input
										id="rn-name"
										type="text"
										class="field-input"
										bind:value={runnerForm.name}
										placeholder="staging-node"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-url">
										URL
										<span class="field-hint"
											>Use <code>host.docker.internal</code> for local nodes</span
										>
									</label>
									<input
										id="rn-url"
										type="url"
										class="field-input"
										bind:value={runnerForm.url}
										placeholder="http://host.docker.internal:3002"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-token">Token</label>
									<input
										id="rn-token"
										type="text"
										class="field-input"
										bind:value={runnerForm.token}
										placeholder="secret-token"
										spellcheck="false"
										autocomplete="off"
									/>
								</div>
								<div class="field">
									<label class="field-label" for="rn-browser">Browser</label>
									<select id="rn-browser" class="field-input" bind:value={runnerForm.browser}>
										{#each BROWSERS as b}
											<option value={b.id}>{b.label}</option>
										{/each}
									</select>
								</div>
							</div>
							{#if runnerFormError}
								<p class="form-error">{runnerFormError}</p>
							{/if}
							<div class="runner-form-actions">
								<Button on:click={handleAddRunner} disabled={runnerFormSaving}>
									{runnerFormSaving ? 'Checking…' : 'Add Runner'}
								</Button>
								<Button
									variant="ghost"
									on:click={() => {
										runnerFormOpen = false;
										runnerFormError = '';
									}}
									disabled={runnerFormSaving}>Cancel</Button
								>
							</div>
						</div>
					{:else}
						<div class="card-footer">
							<Button variant="ghost" on:click={() => (runnerFormOpen = true)}>+ Add Runner</Button>
						</div>
					{/if}
				</div>
			</div>

			<!-- REPOSITORY -->
		{:else if section === 'repository'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Test Repository</h2>
					<p class="content-desc">Configure ID prefixes for test suites and cases.</p>
				</div>

				<div class="card settings-card">
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="tc-prefix">Test Case prefix</label>
							<input
								id="tc-prefix"
								type="text"
								class="field-input mono"
								bind:value={prefixes.testCasePrefix}
								placeholder="TC"
								maxlength="10"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="ts-prefix">Test Suite prefix</label>
							<input
								id="ts-prefix"
								type="text"
								class="field-input mono"
								bind:value={prefixes.testSuitePrefix}
								placeholder="TS"
								maxlength="10"
							/>
						</div>
					</div>
					<p class="content-desc">
						Examples: <code class="code-sample">{prefixes.testCasePrefix || 'TC'}-001</code>,
						<code class="code-sample">{prefixes.testSuitePrefix || 'TS'}-001</code>
					</p>
					<div class="card-footer">
						<Button on:click={handleSavePrefixes} disabled={prefixesSaving}>
							{prefixesSaving ? 'Saving…' : 'Save Prefixes'}
						</Button>
					</div>
				</div>

				<div class="content-header" style="margin-top: 1rem">
					<h2>Migrate IDs</h2>
					<p class="content-desc">
						Rename all existing test IDs to use a new prefix. Cucumber tags in code are <strong
							>not</strong
						> affected — you manage those separately.
					</p>
				</div>

				<div class="card settings-card">
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="mig-tc">New case prefix</label>
							<input
								id="mig-tc"
								type="text"
								class="field-input mono"
								bind:value={migrateForm.testCasePrefix}
								placeholder={prefixes.testCasePrefix}
								maxlength="10"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="mig-ts">New suite prefix</label>
							<input
								id="mig-ts"
								type="text"
								class="field-input mono"
								bind:value={migrateForm.testSuitePrefix}
								placeholder={prefixes.testSuitePrefix}
								maxlength="10"
							/>
						</div>
					</div>
					<div class="card-footer">
						<Button variant="ghost" on:click={handleMigratePrefixes} disabled={migrating}>
							{migrating ? 'Migrating…' : 'Run Migration'}
						</Button>
					</div>
				</div>
			</div>

			<!-- INTEGRATIONS -->
		{:else if section === 'integrations'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Integrations</h2>
					<p class="content-desc">
						Connect Discord and Slack to receive run notifications with pass/fail results and report
						links.
					</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">Webhooks</p>

					<div class="field">
						<label class="field-label" for="discord-url">
							<span>Discord Webhook URL</span>
							<span class="field-hint">Leave blank to disable Discord notifications</span>
						</label>
						<input
							id="discord-url"
							type="url"
							class="field-input"
							bind:value={integrations.discordWebhookUrl}
							placeholder="https://discord.com/api/webhooks/…"
						/>
					</div>

					<div class="field">
						<label class="field-label" for="slack-url">
							<span>Slack Webhook URL</span>
							<span class="field-hint">Leave blank to disable Slack notifications</span>
						</label>
						<input
							id="slack-url"
							type="url"
							class="field-input"
							bind:value={integrations.slackWebhookUrl}
							placeholder="https://hooks.slack.com/services/…"
						/>
					</div>

					<div class="field">
						<label class="field-label" for="public-url">
							<span>Public URL</span>
							<span class="field-hint"
								>Base URL of this Plum instance, used to link reports in notifications</span
							>
						</label>
						<input
							id="public-url"
							type="url"
							class="field-input"
							bind:value={integrations.notifyPublicUrl}
							placeholder="https://plum.yourcompany.com"
						/>
					</div>

					<Button on:click={handleSaveIntegrations} disabled={integrationsSaving}>
						{integrationsSaving ? 'Saving…' : 'Save Integrations'}
					</Button>
				</div>

				<div class="card settings-card">
					<p class="card-title">CI / External Triggers</p>
					<p class="content-desc">
						Trigger a Plum run from GitHub Actions (e.g. on a pull request, against its preview
						deployment) or any other external script by calling <code class="code-sample"
							>POST {API_BASE}/trigger</code
						>
						with an
						<code class="code-sample">Authorization: ApiKey …</code> header. Generate a key on the
						<button class="link-btn" on:click={() => setSection('mcp')}>MCP tab</button>
						and store it as a repo secret — never commit it directly. Runs triggered this way show up
						in Reports tagged <Badge variant="external">External</Badge>.
					</p>
					<pre class="mcp-snippet">{ciWorkflowSnippet}</pre>
					<div class="card-footer">
						<Button variant="ghost" on:click={handleCopyCiSnippet}>
							{ciSnippetCopied ? 'Copied!' : 'Copy Workflow Step'}
						</Button>
					</div>
				</div>
			</div>

			<!-- MCP -->
		{:else if section === 'mcp'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>MCP Integration</h2>
					<p class="content-desc">
						Generate an API key for any MCP-compatible AI client — Claude, Cursor, Windsurf, and
						others.
					</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">API Key</p>

					{#if !mcpKeySet}
						<p class="content-desc">No key generated yet.</p>
						<div class="card-footer">
							<Button on:click={handleGenerateMcpKey} disabled={mcpGenerating}>
								{mcpGenerating ? 'Generating…' : 'Generate Key'}
							</Button>
						</div>
					{:else}
						<div class="mcp-key-row">
							<input
								type={mcpShowKey ? 'text' : 'password'}
								class="field-input mcp-key-input"
								value={mcpKey}
								readonly
								spellcheck="false"
								autocomplete="off"
							/>
							<button
								class="icon-btn"
								title={mcpShowKey ? 'Hide key' : 'Show key'}
								on:click={() => (mcpShowKey = !mcpShowKey)}
							>
								{#if mcpShowKey}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
										/><path
											d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
										/><line x1="1" y1="1" x2="23" y2="23" />
									</svg>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
											cx="12"
											cy="12"
											r="3"
										/>
									</svg>
								{/if}
							</button>
							<button class="icon-btn" title="Copy key" on:click={handleCopyMcpKey}>
								{#if mcpKeyCopied}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{:else}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" /><path
											d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
										/>
									</svg>
								{/if}
							</button>
						</div>
						<p class="mcp-regen-note">Regenerating invalidates the existing key immediately.</p>
						<div class="card-footer">
							<Button variant="ghost" on:click={handleGenerateMcpKey} disabled={mcpGenerating}>
								{mcpGenerating ? 'Generating…' : 'Regenerate Key'}
							</Button>
						</div>
					{/if}
				</div>

				{#if mcpKeySet}
					<div class="card settings-card">
						<p class="card-title">Config Snippet</p>
						<p class="content-desc">
							Add this to your MCP client's config file (e.g.
							<code class="code-sample">claude_desktop_config.json</code>, Cursor MCP settings,
							etc.).
						</p>
						<pre class="mcp-snippet">{mcpConfigSnippet}</pre>
						<div class="card-footer">
							<Button variant="ghost" on:click={handleCopyMcpSnippet}>
								{mcpSnippetCopied ? 'Copied!' : 'Copy Config'}
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<!-- ACCOUNT -->
		{:else if section === 'account'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Account</h2>
					<p class="content-desc">Manage your profile, credentials and session.</p>
				</div>

				<div class="card settings-card">
					<p class="card-title">Profile</p>
					<div class="field">
						<label class="field-label" for="profile-name">Name</label>
						<input
							id="profile-name"
							type="text"
							class="field-input"
							bind:value={profileForm.name}
						/>
					</div>
					<div class="field">
						<label class="field-label" for="profile-email">Email</label>
						<input
							id="profile-email"
							type="email"
							class="field-input"
							bind:value={profileForm.email}
						/>
					</div>
					{#if profileError}<p class="form-error">{profileError}</p>{/if}
					<div class="card-footer">
						<Button
							on:click={handleUpdateProfile}
							disabled={profileSaving || !profileForm.name || !profileForm.email}
						>
							{profileSaving ? 'Saving…' : 'Save Profile'}
						</Button>
					</div>
				</div>

				<div class="card settings-card">
					<p class="card-title">Change password</p>
					<div class="field">
						<label class="field-label" for="pw-current">Current password</label>
						<input
							id="pw-current"
							type="password"
							class="field-input"
							bind:value={pwForm.currentPassword}
							autocomplete="current-password"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="pw-new">New password</label>
						<input
							id="pw-new"
							type="password"
							class="field-input"
							bind:value={pwForm.newPassword}
							autocomplete="new-password"
						/>
					</div>
					<div class="field">
						<label class="field-label" for="pw-confirm">Confirm new password</label>
						<input
							id="pw-confirm"
							type="password"
							class="field-input"
							bind:value={pwForm.confirmPassword}
							autocomplete="new-password"
						/>
					</div>
					{#if pwError}<p class="form-error">{pwError}</p>{/if}
					<div class="card-footer">
						<Button
							on:click={handleChangePassword}
							disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword}
						>
							{pwSaving ? 'Saving…' : 'Change Password'}
						</Button>
					</div>
				</div>

				<div class="card settings-card">
					<div class="card-footer">
						<Button variant="danger" size="sm" on:click={handleLogout}>Sign out</Button>
					</div>
				</div>
			</div>

			<!-- USERS (admin only) -->
		{:else if section === 'users'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Users</h2>
					<p class="content-desc">Add and manage who can access Plum.</p>
				</div>

				<ConfirmModal
					bind:open={confirmDeleteUserOpen}
					title="Remove User"
					confirmLabel="Remove"
					on:confirm={() => handleDeleteUser(confirmDeleteUser?.id, confirmDeleteUser?.name)}
				>
					{#if confirmDeleteUser}
						Remove <strong>{confirmDeleteUser.name}</strong>? They will lose access immediately.
					{/if}
				</ConfirmModal>

				<div class="card settings-card">
					<p class="card-title">Add User</p>
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="u-name">Name</label>
							<input
								id="u-name"
								type="text"
								class="field-input"
								bind:value={userForm.name}
								placeholder="Jane Smith"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="u-email">Email</label>
							<input
								id="u-email"
								type="email"
								class="field-input"
								bind:value={userForm.email}
								placeholder="jane@example.com"
							/>
						</div>
					</div>
					<div class="field-row">
						<div class="field">
							<label class="field-label" for="u-pw">Password</label>
							<input
								id="u-pw"
								type="password"
								class="field-input"
								bind:value={userForm.password}
								autocomplete="new-password"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="u-role">Role</label>
							<select id="u-role" class="field-input" bind:value={userForm.role}>
								<option value="user">User</option>
								<option value="admin">Admin</option>
							</select>
						</div>
					</div>
					{#if userFormError}<p class="form-error">{userFormError}</p>{/if}
					<div class="card-footer">
						<Button on:click={handleCreateUser} disabled={userFormSaving}>
							{userFormSaving ? 'Adding…' : 'Add User'}
						</Button>
					</div>
				</div>

				{#if allUsers.length > 0}
					<div class="users-table">
						{#each allUsers as u (u.id)}
							<div class="user-row">
								<div class="user-info">
									<span class="user-name">{u.name}</span>
									<span class="user-email">{u.email}</span>
								</div>
								<span class="role-chip {u.role}">{u.role}</span>
								{#if u.id !== $auth.user?.id}
									<button
										class="icon-btn danger"
										title="Remove user"
										on:click={() => {
											confirmDeleteUser = { id: u.id, name: u.name };
											confirmDeleteUserOpen = true;
										}}
									>
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										>
											<polyline points="3 6 5 6 21 6" /><path
												d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
											/><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
										</svg>
									</button>
								{:else}
									<span class="you-chip">you</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- BACKUP -->
		{:else if section === 'backup'}
			<div class="content-section" transition:fly={{ y: 6, duration: 180 }}>
				<div class="content-header">
					<h2>Backup</h2>
					<p class="content-desc">
						Export your test cases, schedules, users, and project settings. Automate uploads to any
						S3-compatible storage — Cloudflare R2, Backblaze B2, AWS S3, or MinIO.
					</p>
				</div>

				<!-- Manual export / import -->
				<div class="card settings-card">
					<p class="card-title">Manual Backup</p>
					<div class="backup-row">
						<div class="backup-block">
							<p class="backup-block-title">Export</p>
							<p class="backup-block-desc">
								Downloads a <code>.json</code> file with all cron jobs, test cases, test runs, users,
								runners, and project settings.
							</p>
							<Button on:click={handleExport} disabled={exporting}>
								{exporting ? 'Exporting…' : 'Export JSON'}
							</Button>
						</div>

						<div class="backup-divider"></div>

						<div class="backup-block">
							<p class="backup-block-title">Import</p>
							<p class="backup-block-desc">
								Restores all data from a previously exported backup. Existing records are
								overwritten. Cron jobs are re-scheduled after import.
							</p>
							<div class="import-row">
								<label class="file-label">
									<input
										bind:this={fileInput}
										type="file"
										accept=".json"
										class="file-input-hidden"
										on:change={handleFileChange}
									/>
									<span class="file-btn">{importFile ? importFile.name : 'Choose file…'}</span>
								</label>
								<Button on:click={handleImport} disabled={!importFile || importing}>
									{importing ? 'Importing…' : 'Import'}
								</Button>
							</div>
						</div>
					</div>
					<p class="backup-disclaimer">
						Reports are not included in backups. To back up report history, run
						<code>pg_dump</code> directly on the PostgreSQL volume.
					</p>
				</div>

				<!-- S3 cloud backup -->
				<div class="card settings-card">
					<p class="card-title">S3 Storage</p>
					<p class="backup-block-desc" style="margin-bottom: 1.25rem;">
						Works with any S3-compatible provider — Cloudflare R2, Backblaze B2, AWS S3, or MinIO.
						Leave <strong>Endpoint URL</strong> empty for AWS S3.
					</p>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-endpoint">
								<span>Endpoint URL</span>
								<span class="field-hint">Leave blank for AWS S3</span>
							</label>
							<input
								id="s3-endpoint"
								type="url"
								class="field-input"
								bind:value={backupConfig.backupS3Endpoint}
								placeholder="https://account.r2.cloudflarestorage.com"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-region">
								<span>Region</span>
								<span class="field-hint">Use <code>auto</code> for Cloudflare R2</span>
							</label>
							<input
								id="s3-region"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Region}
								placeholder="us-east-1"
							/>
						</div>
					</div>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-bucket">
								<span>Bucket</span>
							</label>
							<input
								id="s3-bucket"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Bucket}
								placeholder="my-plum-backups"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-prefix">
								<span>Path Prefix</span>
								<span class="field-hint">Optional folder inside the bucket</span>
							</label>
							<input
								id="s3-prefix"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3Prefix}
								placeholder="plum/"
							/>
						</div>
					</div>

					<div class="field-row">
						<div class="field">
							<label class="field-label" for="s3-access-key">
								<span>Access Key ID</span>
							</label>
							<input
								id="s3-access-key"
								type="text"
								class="field-input"
								bind:value={backupConfig.backupS3AccessKey}
								placeholder="AKIAIOSFODNN7EXAMPLE"
								autocomplete="off"
							/>
						</div>
						<div class="field">
							<label class="field-label" for="s3-secret-key">
								<span>Secret Access Key</span>
								<span class="field-hint"
									>{backupS3SecretKeySet
										? 'A key is already saved — leave blank to keep it'
										: 'Required'}</span
								>
							</label>
							<input
								id="s3-secret-key"
								type="password"
								class="field-input"
								bind:value={backupConfig.backupS3SecretKey}
								placeholder={backupS3SecretKeySet ? '••••••••' : 'Enter secret key'}
								autocomplete="new-password"
							/>
						</div>
					</div>

					<div class="backup-actions">
						<Button variant="ghost" on:click={handleTestS3} disabled={backupTestingS3}>
							{backupTestingS3 ? 'Testing…' : 'Test Connection'}
						</Button>
						<Button on:click={handleSaveBackupConfig} disabled={backupConfigSaving}>
							{backupConfigSaving ? 'Saving…' : 'Save S3 Config'}
						</Button>
					</div>

					{#if backupS3TestResult}
						<p
							class="s3-test-result"
							class:s3-test-success={backupS3TestResult === 'success'}
							class:s3-test-error={backupS3TestResult === 'error'}
						>
							{backupS3TestResult === 'success' ? '✓' : '✗'}
							{backupS3TestMessage}
						</p>
					{/if}
				</div>

				<!-- Scheduled backup -->
				<div class="card settings-card" class:card-disabled={!s3Configured}>
					<p class="card-title">Scheduled Backup</p>

					{#if !s3Configured}
						<p class="backup-block-desc">Configure S3 storage above to enable scheduled backups.</p>
					{:else}
						<div class="field">
							<label class="field-label backup-toggle-label" for="backup-enabled">
								<span>Enable scheduled backup</span>
								<button
									id="backup-enabled"
									class="toggle-btn"
									class:active={backupConfig.backupEnabled}
									on:click={() => (backupConfig.backupEnabled = !backupConfig.backupEnabled)}
									role="switch"
									aria-checked={backupConfig.backupEnabled}
								>
									<span class="toggle-thumb"></span>
								</button>
							</label>
						</div>

						<div class="field">
							<label class="field-label" for="backup-cron">
								<span>Cron Expression</span>
								<span class="field-hint">
									5-field cron — e.g. <code>0 2 * * *</code> = daily at 2 AM.
									<a href="https://crontab.guru" target="_blank" rel="noopener noreferrer"
										>Test at crontab.guru ↗</a
									>
								</span>
							</label>
							<input
								id="backup-cron"
								type="text"
								class="field-input field-input-mono"
								bind:value={backupConfig.backupCron}
								placeholder="0 2 * * *"
							/>
						</div>

						{#if backupLastRunAt}
							<p class="backup-last-run">
								Last backup: {new Date(backupLastRunAt).toLocaleString()} —
								{#if backupLastStatus?.startsWith('success:')}
									<span class="status-success"
										>uploaded to {backupLastStatus.replace('success:', '')}</span
									>
								{:else if backupLastStatus?.startsWith('error:')}
									<span class="status-error">{backupLastStatus.replace('error:', '')}</span>
								{:else}
									<span>{backupLastStatus}</span>
								{/if}
							</p>
						{/if}

						<div class="backup-actions">
							<Button variant="ghost" on:click={handleRunBackupNow} disabled={backupRunningNow}>
								{backupRunningNow ? 'Uploading…' : 'Upload to S3 Now'}
							</Button>
							<Button on:click={handleSaveBackupConfig} disabled={backupConfigSaving}>
								{backupConfigSaving ? 'Saving…' : 'Save Schedule'}
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.page-header {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.page-header h1 {
		font-size: 2.5rem;
	}

	/* ── GitHub-style layout ── */
	.settings-layout {
		display: grid;
		grid-template-columns: 200px 1fr;
		gap: 3rem;
		align-items: start;
	}

	.settings-sidebar {
		position: sticky;
		top: 72px;
	}

	.settings-sidebar nav {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.sidebar-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.45rem 0.75rem;
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
	}

	.sidebar-item:hover {
		background: var(--bg-subtle);
		color: var(--text);
	}

	.sidebar-item.active {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 500;
	}

	/* ── Content area ── */
	.settings-content {
		min-width: 0;
	}

	.content-section {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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

	/* ── Card ── */
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

	.field-hint {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--text-muted);
	}

	.logo-preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preview-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.logo-img {
		max-height: 56px;
		max-width: 200px;
		object-fit: contain;
		border-radius: var(--radius-sm);
	}

	.card-footer {
		padding-top: 0.125rem;
	}

	/* ── Toggle switch ── */
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.875rem 1rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.toggle-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}

	.toggle-desc {
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.toggle-switch {
		flex-shrink: 0;
		width: 40px;
		height: 22px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--border);
		cursor: pointer;
		position: relative;
		transition: background 0.2s var(--ease-out);
	}

	.toggle-switch.on {
		background: var(--accent);
	}

	.toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s var(--ease-out);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-switch.on .toggle-thumb {
		transform: translateX(18px);
	}

	/* ── Runner cards ── */
	.runner-cards {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.runner-card {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		transition: border-color var(--duration-fast);
	}

	.runner-card:hover {
		border-color: color-mix(in srgb, var(--text-muted) 40%, var(--border));
	}

	.runner-card.editing {
		border-color: var(--accent);
		background: var(--accent-soft);
		gap: 0.875rem;
		padding: 1rem;
	}

	.runner-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.runner-card-icon {
		color: var(--node);
		flex-shrink: 0;
	}

	.runner-card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		flex: 1;
	}

	.runner-browser-pill {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.1rem 0.45rem;
		flex-shrink: 0;
	}

	.runner-card-url {
		font-size: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-left: calc(13px + 0.5rem);
	}

	.runner-card-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding-left: calc(13px + 0.5rem);
		margin-top: 0.125rem;
	}

	.ping-badge {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-pill);
		flex-shrink: 0;
	}

	.ping-badge.ok {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.ping-badge.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}
	.ping-badge.pinging {
		color: var(--text-muted);
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	.runner-form {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		background: var(--bg-subtle);
	}

	.runner-form-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text);
	}

	.runner-form-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.runner-form-actions {
		display: flex;
		gap: 0.5rem;
	}

	.card-disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	/* ── Backup ── */
	.backup-row {
		display: flex;
		gap: 2rem;
	}

	.backup-block {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.backup-divider {
		width: 1px;
		background: var(--border);
		flex-shrink: 0;
	}

	.backup-block-title {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
	}

	.backup-block-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.6;
	}

	.backup-block-desc code {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}

	.backup-disclaimer {
		margin-top: 1rem;
		padding: 0.625rem 0.875rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.backup-actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}

	.s3-test-result {
		margin-top: 0.625rem;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.s3-test-success {
		color: var(--pass);
	}

	.s3-test-error {
		color: var(--fail);
	}

	.backup-last-run {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}

	.status-success {
		color: var(--pass);
	}

	.status-error {
		color: var(--fail);
	}

	.backup-toggle-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: default;
	}

	.toggle-btn {
		flex-shrink: 0;
		width: 40px;
		height: 22px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--border);
		cursor: pointer;
		position: relative;
		transition: background 0.2s var(--ease-out);
	}

	.toggle-btn.active {
		background: var(--accent);
	}

	.toggle-btn .toggle-thumb {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: white;
		transition: transform 0.2s var(--ease-out);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.toggle-btn.active .toggle-thumb {
		transform: translateX(18px);
	}

	.field-input-mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
	}

	.import-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.file-label {
		cursor: pointer;
	}

	.file-input-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.file-btn {
		display: inline-flex;
		align-items: center;
		height: 34px;
		padding: 0 0.875rem;
		font-size: 0.8125rem;
		font-family: inherit;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		white-space: nowrap;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		transition:
			background var(--duration-fast),
			border-color var(--duration-fast);
	}

	.file-label:hover .file-btn {
		border-color: var(--text-muted);
		background: var(--bg-subtle);
	}

	/* ── Field row (two columns) ── */
	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.mono {
		font-family: 'JetBrains Mono', monospace !important;
		font-size: 0.8125rem !important;
	}

	.code-sample {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		padding: 0.1em 0.3em;
		border-radius: 3px;
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

	.account-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.account-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
	}

	.account-email {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.form-error {
		font-size: 0.8125rem;
		color: var(--fail);
	}

	/* ── Responsive ── */
	@media (max-width: 640px) {
		.settings-layout {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.settings-sidebar {
			position: static;
		}

		.settings-sidebar nav {
			flex-direction: row;
			flex-wrap: wrap;
		}

		.backup-row {
			flex-direction: column;
		}

		.backup-divider {
			width: 100%;
			height: 1px;
		}

		.runner-form-fields,
		.field-row {
			grid-template-columns: 1fr;
		}
	}

	/* ── Users table ── */
	.users-table {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.user-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
	}

	.user-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.user-name {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text);
	}

	.user-email {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.role-chip {
		font-size: 0.7rem;
		font-weight: 500;
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
	}

	.role-chip.admin {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.role-chip.user {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.you-chip {
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.55rem;
		flex-shrink: 0;
	}

	/* ── MCP ── */
	.mcp-key-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.mcp-key-input {
		flex: 1;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		min-width: 0;
	}

	.mcp-regen-note {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.mcp-snippet {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.875rem 1rem;
		white-space: pre;
		overflow-x: auto;
		color: var(--text);
		line-height: 1.6;
		margin: 0;
	}

	/* reuse icon-btn from other pages */
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			background var(--duration-fast),
			color var(--duration-fast);
		flex-shrink: 0;
	}

	.icon-btn.danger:hover {
		background: var(--fail-soft);
		color: var(--fail);
	}
</style>
