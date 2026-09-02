/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export function clickOutside(node) {
	function handle(e) {
		if (!node.contains(e.target)) node.dispatchEvent(new CustomEvent('clickoutside'));
	}
	document.addEventListener('click', handle, true);
	return {
		destroy() {
			document.removeEventListener('click', handle, true);
		}
	};
}
