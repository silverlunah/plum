/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// navigator.clipboard is undefined outside a secure context (a production
// install served over plain http:// on a bare IP) — fall back to a hidden
// textarea + execCommand so copy buttons still work.
export async function copyText(text) {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// permissions or context refused it — use the fallback
		}
	}
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.setAttribute('readonly', '');
	ta.style.position = 'fixed';
	ta.style.opacity = '0';
	document.body.appendChild(ta);
	ta.select();
	document.execCommand('copy');
	ta.remove();
}
