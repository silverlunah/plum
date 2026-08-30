/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

function escapeAttr(v) {
	return v.replace(/"/g, '&quot;');
}

function shallowMarkup(el) {
	const tag = el.tagName.toLowerCase();
	const attrs = Array.from(el.attributes ?? [])
		.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
		.join('');
	const childCount = el.children.length;
	const text = childCount === 0 ? (el.textContent ?? '').trim() : '';
	const inner =
		childCount > 0
			? `\n  <!-- ${childCount} child element${childCount === 1 ? '' : 's'} -->\n`
			: text
				? `\n  ${text.slice(0, 200)}\n`
				: '';
	return `<${tag}${attrs}>${inner}</${tag}>`;
}

/** Split a DOM tree row's label into its coloured parts: tag, id, class list. */
export function nodeSelectorParts(el) {
	return {
		tag: el.tagName.toLowerCase(),
		id: el.id || '',
		classes: (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)
	};
}

/** Trimmed text content of a leaf element, for inline preview in the DOM tree. */
export function nodeTextPreview(el) {
	if (el.children.length > 0) return '';
	return (el.textContent ?? '').trim().slice(0, 120);
}

/** Summarizes a DOM element for the replay inspector panel: markup preview, attributes, size. */
export function describeElement(el) {
	const rect = el.getBoundingClientRect();
	return {
		markup: shallowMarkup(el),
		attributes: Array.from(el.attributes ?? []).map((a) => ({ name: a.name, value: a.value })),
		box: { width: Math.round(rect.width), height: Math.round(rect.height) }
	};
}
