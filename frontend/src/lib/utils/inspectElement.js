/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

// HTML elements that never have a closing tag or children.
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

function escapeAttr(v) {
	return v.replace(/"/g, '&quot;');
}

function openingTag(el) {
	const attrs = Array.from(el.attributes ?? [])
		.map((a) => ` ${a.name}="${escapeAttr(a.value)}"`)
		.join('');
	return `<${el.tagName.toLowerCase()}${attrs}>`;
}

function indentBlock(text, indent) {
	return text
		.split('\n')
		.map((line) => indent + line)
		.join('\n');
}

// Full, indented serialization of an element and everything inside it — every
// attribute, every text node, every comment, every closing tag — so the Element
// tab shows exactly what a browser's element inspector shows for a selected node.
function serializeElement(el, indent = '') {
	const tag = el.tagName.toLowerCase();
	const open = indent + openingTag(el);
	if (VOID_ELEMENTS.has(tag)) return open;

	// Script/style hold code, not markup — keep it verbatim.
	if (tag === 'script' || tag === 'style') {
		const raw = (el.textContent ?? '').replace(/^\n+|\s+$/g, '');
		return raw
			? `${open}\n${indentBlock(raw, indent + '  ')}\n${indent}</${tag}>`
			: `${open}</${tag}>`;
	}

	const parts = [];
	for (const child of el.childNodes) {
		if (child.nodeType === ELEMENT_NODE) {
			parts.push(serializeElement(child, indent + '  '));
		} else if (child.nodeType === TEXT_NODE) {
			const text = (child.textContent ?? '').trim();
			if (text) parts.push(indentBlock(text, indent + '  '));
		} else if (child.nodeType === COMMENT_NODE) {
			parts.push(`${indent}  <!--${child.textContent}-->`);
		}
	}

	const close = `</${tag}>`;
	if (parts.length === 0) return open + close;
	// A single one-line text child sits on the tag's own line: <a href="…">Login</a>.
	if (el.children.length === 0 && parts.length === 1 && !parts[0].includes('\n')) {
		return open + parts[0].trim() + close;
	}
	return `${open}\n${parts.join('\n')}\n${indent}${close}`;
}

/** Tag name + every attribute of an element, in document order, for the DOM tree row. */
export function nodeTag(el) {
	const tag = el.tagName.toLowerCase();
	return {
		tag,
		isVoid: VOID_ELEMENTS.has(tag),
		attributes: Array.from(el.attributes ?? []).map((a) => ({ name: a.name, value: a.value }))
	};
}

/** Trimmed direct text of an element (not its descendants'), for the DOM tree row. */
export function nodeTextPreview(el) {
	if (el.children.length > 0) return '';
	return (el.textContent ?? '').trim();
}

/** The selected element for the replay inspector: full markup, attribute list, box size. */
export function describeElement(el) {
	const rect = el.getBoundingClientRect();
	return {
		markup: serializeElement(el),
		attributes: Array.from(el.attributes ?? []).map((a) => ({ name: a.name, value: a.value })),
		box: { width: Math.round(rect.width), height: Math.round(rect.height) }
	};
}
