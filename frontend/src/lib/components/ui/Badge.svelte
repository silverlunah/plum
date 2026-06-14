<!--
This file is part of Plum.

Plum is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Plum is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Plum. If not, see https://www.gnu.org/licenses/.
-->

<script>
	/** @type {'pass' | 'fail' | 'tag' | 'schedule' | 'neutral'} */
	export let variant = 'neutral';
</script>

<span class="badge {variant}"><slot /></span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.2rem 0.6rem;
		border-radius: 100px;
		white-space: nowrap;
	}

	.pass {
		background: var(--pass-soft);
		color: var(--pass);
	}

	.fail {
		background: var(--fail-soft);
		color: var(--fail);
	}

	.tag {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.schedule {
		background: var(--warn-soft);
		color: var(--warn);
	}

	.neutral {
		background: var(--bg-subtle);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}
</style>
