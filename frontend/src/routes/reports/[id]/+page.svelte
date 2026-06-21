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
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { fetchReportDetail, screenshotUrl } from '$lib/api/reports';
	import { isScheduled, triggerLabel, fmtDuration, stagger, featureFile } from '$lib/utils/format';
	import Badge from '$lib/components/ui/Badge.svelte';
	import BrowserIcon from '$lib/components/icons/BrowserIcon.svelte';

	const reportId = parseInt($page.params.id, 10);

	let detail = null;
	let error = null;
	let expandedScenarios = new Set();

	onMount(async () => {
		try {
			detail = await fetchReportDetail(reportId);
		} catch {
			error = 'Could not load report.';
		}
	});

	function toggleScenario(id) {
		if (expandedScenarios.has(id)) expandedScenarios.delete(id);
		else expandedScenarios.add(id);
		expandedScenarios = expandedScenarios;
	}

	function keywordClass(kw) {
		const k = kw.toLowerCase();
		if (k === 'given') return 'kw-given';
		if (k === 'when') return 'kw-when';
		if (k === 'then') return 'kw-then';
		return 'kw-and';
	}

	function scenarioTestTag(scenario) {
		return scenario.tags.find((tag) => /^@test[\w-]*/i.test(tag));
	}

	function featureSuiteTag(feature) {
		for (const scenario of feature.scenarios) {
			const suiteTag = scenario.tags.find((tag) => /suite/i.test(tag));
			if (suiteTag) return suiteTag;
		}
		return null;
	}

	function visibleTags(scenario) {
		const testTag = scenarioTestTag(scenario);
		if (testTag) return [testTag];
		return scenario.tags.filter((tag) => !tag.includes('suite'));
	}

	function worstStatus(scenarios) {
		const rank = { failed: 3, pending: 2, skipped: 1, passed: 0 };
		return scenarios.reduce(
			(status, scenario) =>
				(rank[scenario.status] ?? 0) > (rank[status] ?? 0) ? scenario.status : status,
			'passed'
		);
	}

	function groupedScenarios(scenarios) {
		const groups = new Map();
		for (const scenario of scenarios) {
			const testTag = scenarioTestTag(scenario);
			const key = testTag || `${scenario.keyword}:${scenario.name}`;
			if (!groups.has(key)) {
				groups.set(key, {
					key,
					name: scenario.name,
					tags: visibleTags(scenario),
					scenarios: [],
					duration: 0,
					status: scenario.status
				});
			}
			const group = groups.get(key);
			group.scenarios.push(scenario);
			group.duration += scenario.duration;
			group.status = worstStatus(group.scenarios);
		}
		return Array.from(groups.values());
	}

	$: overallPass = detail?.status === 'PASS';
	$: passed =
		detail?.features.flatMap((f) => f.scenarios).filter((s) => s.status === 'passed').length ?? 0;
	$: failed =
		detail?.features.flatMap((f) => f.scenarios).filter((s) => s.status === 'failed').length ?? 0;
	$: skipped =
		detail?.features
			.flatMap((f) => f.scenarios)
			.filter((s) => s.status === 'skipped' || s.status === 'pending').length ?? 0;
	$: totalDuration =
		detail?.features.flatMap((f) => f.scenarios).reduce((s, sc) => s + sc.duration, 0) ?? 0;
	$: groupedFeatures =
		detail?.features.map((feature) => ({
			...feature,
			scenarioGroups: groupedScenarios(feature.scenarios)
		})) ?? [];
</script>

<svelte:head><title>Report — Plum</title></svelte:head>

<div class="back-row">
	<a href="/reports" class="back-link">
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 19 5 12 12 5" />
		</svg>
		Reports
	</a>
</div>

{#if error}
	<div class="error-state">{error}</div>
{:else if !detail}
	<div class="loading-state">
		<div class="loading-dots"><span></span><span></span><span></span></div>
	</div>
{:else}
	<div class="report-header" class:pass={overallPass} class:fail={!overallPass}>
		<div class="header-main">
			<div class="header-status">
				<div class="status-icon-wrap" class:pass-bg={overallPass} class:fail-bg={!overallPass}>
					{#if overallPass}
						<svg
							width="26"
							height="26"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{:else}
						<svg
							width="26"
							height="26"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					{/if}
				</div>

				<div>
					<div class="h1-row">
						<h1>{overallPass ? 'Passed' : 'Failed'}</h1>
						{#if detail.testRun?.title}
							<span class="run-name-badge">{detail.testRun.title}</span>
						{:else if isScheduled(detail.triggerType)}
							<span class="run-name-badge">{detail.triggerType}</span>
						{/if}
					</div>
					<div class="header-meta">
						<span class="mono">{detail.tags}</span>
						<span class="meta-sep">·</span>
						<span>{triggerLabel(detail.triggerType)}</span>
						<span class="meta-sep">·</span>
						<span>{new Date(detail.createdAt).toLocaleString()}</span>
						<span class="meta-sep">·</span>
						<span class="browser-pill">
							<BrowserIcon browser={detail.browser ?? 'chromium'} />
							{detail.browser ?? 'chromium'}
						</span>
					</div>
				</div>
			</div>

			<div class="header-stats">
				<div class="stat">
					<span class="stat-num pass-color">{passed}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
						passed
					</span>
				</div>
				{#if failed > 0}
					<div class="stat">
						<span class="stat-num fail-color">{failed}</span>
						<span class="stat-label">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
							</svg>
							failed
						</span>
					</div>
				{/if}
				{#if skipped > 0}
					<div class="stat">
						<span class="stat-num muted-color">{skipped}</span>
						<span class="stat-label">
							<svg
								width="10"
								height="10"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
							>
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
							skipped
						</span>
					</div>
				{/if}
				<div class="stat">
					<span class="stat-num">{fmtDuration(totalDuration)}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
						</svg>
						duration
					</span>
				</div>
				<div class="stat">
					<span class="stat-num">{detail.runners}</span>
					<span class="stat-label">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						>
							<rect x="2" y="3" width="20" height="14" rx="2" />
							<path d="M8 21h8M12 17v4" />
						</svg>
						runner{detail.runners !== 1 ? 's' : ''}
					</span>
				</div>
			</div>
		</div>
	</div>

	{#each groupedFeatures as feature, fi}
		<div
			class="feature"
			class:feature-pass={feature.status === 'passed'}
			class:feature-fail={feature.status !== 'passed'}
			style={stagger(fi, 60)}
		>
			<div class="feature-header">
				<h2 class="feature-name">
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="feature-icon"
					>
						<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
					{feature.name}
					{#if featureSuiteTag(feature)}
						<span class="suite-tag">{featureSuiteTag(feature)}</span>
					{/if}
				</h2>
				<div class="feature-right">
					<span class="feature-file" title={feature.uri}>{featureFile(feature.uri)}</span>
					<Badge variant={feature.status === 'passed' ? 'pass' : 'fail'}>
						{feature.status}
					</Badge>
				</div>
			</div>

			<div class="scenarios">
				{#each feature.scenarioGroups as group, si}
					{@const scenId = `${fi}-${group.key}`}
					{@const open = expandedScenarios.has(scenId)}
					<div
						class="scenario"
						class:scenario-fail={group.status === 'failed'}
						style={stagger(fi * 5 + si, 40)}
					>
						<button class="scenario-header" on:click={() => toggleScenario(scenId)}>
							<span
								class="scenario-status-dot"
								class:pass={group.status === 'passed'}
								class:fail={group.status === 'failed'}
								class:skip={group.status === 'skipped' || group.status === 'pending'}
							></span>

							<span class="scenario-name">
								{group.name}
								{#if group.scenarios.length > 1}
									<span class="scenario-count">{group.scenarios.length} cases</span>
								{/if}
							</span>

							<div class="scenario-tags">
								{#each group.tags as tag}
									<span class="tag-chip">{tag}</span>
								{/each}
							</div>

							<span class="scenario-duration">{fmtDuration(group.duration)}</span>

							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								class="chevron"
								class:rotated={open}
							>
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</button>

						{#if open}
							<div class="steps" transition:slide={{ duration: 200 }}>
								{#each group.scenarios as scenario, exampleIndex}
									{#if group.scenarios.length > 1}
										<div class="example-header">
											<span
												class="scenario-status-dot"
												class:pass={scenario.status === 'passed'}
												class:fail={scenario.status === 'failed'}
												class:skip={scenario.status === 'skipped' || scenario.status === 'pending'}
											></span>
											<span>Case {exampleIndex + 1}</span>
											<span class="scenario-duration">{fmtDuration(scenario.duration)}</span>
										</div>
									{/if}

									{#each scenario.steps as step}
										<div
											class="step"
											class:step-fail={step.status === 'failed'}
											class:step-skip={step.status === 'skipped' || step.status === 'pending'}
										>
											<div class="step-row">
												<span class="step-status-icon">
													{#if step.status === 'passed'}✓{:else if step.status === 'failed'}✗{:else}−{/if}
												</span>
												<span class="kw {keywordClass(step.keyword)}">{step.keyword}</span>
												<span class="step-name">{step.name}</span>
												<span class="step-duration">{fmtDuration(step.duration)}</span>
											</div>

											{#if step.error}
												<pre class="step-error">{step.error}</pre>
											{/if}

											{#if step.screenshot}
												<details class="screenshot-wrap" open>
													<summary class="screenshot-toggle">Screenshot</summary>
													<img
														class="screenshot"
														src={screenshotUrl(step.screenshot)}
														alt="Failure screenshot"
													/>
												</details>
											{/if}
										</div>
									{/each}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
{/if}

<style>
	.back-row {
		margin-bottom: 1.5rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
		transition: color var(--duration-fast);
	}

	.back-link:hover {
		color: var(--text);
	}

	.report-header {
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		border-top-width: 3px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		background: var(--bg-elevated);
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.report-header.pass {
		border-top-color: var(--pass);
	}
	.report-header.fail {
		border-top-color: var(--fail);
	}

	.header-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.header-status {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-icon-wrap {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.status-icon-wrap.pass-bg {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.status-icon-wrap.fail-bg {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.h1-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.2rem;
	}

	.run-name-badge {
		display: inline-flex;
		align-items: center;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
		border-radius: 100px;
		padding: 0.25rem 0.7rem;
		white-space: nowrap;
		max-width: 240px;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 3px;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 0;
	}

	.header-meta {
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.meta-sep {
		opacity: 0.4;
	}

	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
	}

	.browser-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		font-weight: 500;
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 0.1rem 0.45rem;
	}

	.header-stats {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		flex-shrink: 0;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}

	.stat-num {
		font-family: var(--font-display);
		font-size: 1.75rem;
		line-height: 1;
		font-weight: 400;
		color: var(--text);
	}

	.stat-label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.68rem;
		color: var(--text-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.pass-color {
		color: var(--pass);
	}
	.fail-color {
		color: var(--fail);
	}
	.muted-color {
		color: var(--text-muted);
	}

	.feature {
		margin-bottom: 1.25rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-top-width: 3px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		animation: fadeUp 0.35s var(--ease-out) both;
	}

	.feature-pass {
		border-top-color: var(--pass);
	}
	.feature-fail {
		border-top-color: var(--fail);
	}

	.feature-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-subtle);
	}

	.feature-icon {
		flex-shrink: 0;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.feature-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9375rem;
		font-family: var(--font-display);
		font-weight: 400;
		flex: 1;
		min-width: 0;
	}

	.feature-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.feature-file {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.suite-tag {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.1rem 0.4rem;
		border-radius: 100px;
		font-weight: 500;
	}

	.scenarios {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.scenario {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		overflow: hidden;
		animation: fadeUp 0.3s var(--ease-out) both;
	}

	.scenario.scenario-fail {
		border-left-width: 3px;
		border-left-color: var(--fail);
	}

	.scenario-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		width: 100%;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-body);
		transition: background var(--duration-fast);
	}

	.scenario-header:hover {
		background: var(--bg-subtle);
	}

	.scenario-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.scenario-status-dot.pass {
		background: var(--pass);
	}
	.scenario-status-dot.fail {
		background: var(--fail);
	}
	.scenario-status-dot.skip {
		background: var(--text-muted);
	}

	.scenario-name {
		flex: 1;
		font-size: 0.875rem;
		color: var(--text);
		font-weight: 400;
		text-align: left;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.scenario-count {
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: var(--bg-subtle);
		border: 1px solid var(--border);
		border-radius: 100px;
		padding: 0.05rem 0.4rem;
		white-space: nowrap;
	}

	.scenario-tags {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.tag-chip {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.1rem 0.4rem;
		border-radius: 100px;
	}

	.scenario-duration {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
	}

	.chevron {
		color: var(--text-muted);
		flex-shrink: 0;
		transition: transform var(--duration-fast) var(--ease-out);
	}

	.chevron.rotated {
		transform: rotate(90deg);
	}

	.steps {
		border-top: 1px solid var(--border);
		background: var(--bg-subtle);
		padding: 0.5rem 0;
	}

	.example-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem 0.25rem 1.25rem;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.example-header:not(:first-child) {
		margin-top: 0.375rem;
		border-top: 1px dashed var(--border);
	}

	.example-header .scenario-duration {
		margin-left: auto;
	}

	.step {
		padding: 0.375rem 1rem 0.375rem 1.25rem;
	}
	.step-fail {
		background: color-mix(in srgb, var(--fail-soft) 40%, transparent);
	}
	.step-skip {
		opacity: 0.5;
	}

	.step-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.step-status-icon {
		font-size: 0.75rem;
		font-weight: 600;
		width: 14px;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.step-fail .step-status-icon {
		color: var(--fail);
	}
	.step:not(.step-fail):not(.step-skip) .step-status-icon {
		color: var(--pass);
	}

	.kw {
		font-size: 0.72rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		flex-shrink: 0;
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
		font-family: 'JetBrains Mono', monospace;
	}

	.kw-given {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.kw-when {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.kw-then {
		background: var(--pass-soft);
		color: var(--pass);
	}
	.kw-and {
		background: var(--bg-elevated);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.step-name {
		flex: 1;
		font-size: 0.8125rem;
		color: var(--text);
		font-family: 'JetBrains Mono', monospace;
	}

	.step-duration {
		font-size: 0.7rem;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
	}

	.step-error {
		margin: 0.375rem 0 0.25rem 1.75rem;
		padding: 0.625rem 0.875rem;
		background: var(--fail-soft);
		color: var(--fail);
		border-radius: var(--radius-sm);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
		border-left: 2px solid var(--fail);
	}

	.screenshot-wrap {
		margin: 0.5rem 0 0.25rem 1.75rem;
	}

	.screenshot-toggle {
		font-size: 0.75rem;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
	}

	.screenshot {
		margin-top: 0.5rem;
		max-width: 100%;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: 4rem 0;
	}

	.loading-dots {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.loading-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		animation: dotBeat 1.2s ease-in-out infinite;
	}

	.loading-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.loading-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes dotBeat {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.3;
			transform: scale(0.6);
		}
	}

	.error-state {
		padding: 3rem 0;
		color: var(--fail);
		text-align: center;
		font-size: 0.9375rem;
	}
</style>
