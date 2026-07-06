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
	export let status = 'passed';
</script>

<span
	class="step-status-icon"
	class:icon-pass={status === 'passed'}
	class:icon-fail={status === 'failed'}
	class:icon-skip={status !== 'passed' && status !== 'failed'}
>
	{#if status === 'passed'}✓{:else if status === 'failed'}✗{:else}−{/if}
</span>

<style>
	.step-status-icon {
		font-size: 0.75rem;
		font-weight: 600;
		width: 14px;
		flex-shrink: 0;
		text-align: center;
	}

	.icon-pass {
		color: var(--pass);
	}
	.icon-fail {
		color: var(--fail);
	}
	.icon-skip {
		color: var(--text-muted);
	}
</style>
