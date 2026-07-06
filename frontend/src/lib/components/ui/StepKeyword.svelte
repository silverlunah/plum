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
	import { keywordClass } from '$lib/utils/format';

	export let keyword = '';

	$: klass = keywordClass(keyword);
</script>

<span
	class="kw"
	class:kw-given={klass === 'kw-given'}
	class:kw-when={klass === 'kw-when'}
	class:kw-then={klass === 'kw-then'}
	class:kw-and={klass === 'kw-and'}>{keyword}</span
>

<style>
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
</style>
