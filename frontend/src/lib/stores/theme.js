/*
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
 */

/*
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
*/

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'plum-theme';
const initial = browser ? (localStorage.getItem(KEY) ?? 'light') : 'light';

export const theme = writable(initial);

theme.subscribe((val) => {
	if (!browser) return;
	localStorage.setItem(KEY, val);
	document.documentElement.setAttribute('data-theme', val);
});
