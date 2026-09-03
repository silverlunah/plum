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

// Full, indented serialization of an element and everything inside it, every
// attribute, every text node, every comment, every closing tag, so the Element
// tab shows exactly what a browser's element inspector shows for a selected node.
function serializeElement(el, indent = '') {
	const tag = el.tagName.toLowerCase();
	const open = indent + openingTag(el);
	if (VOID_ELEMENTS.has(tag)) return open;

	// Script/style hold code, not markup, keep it verbatim.
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

/** The selected element for the replay inspector: full markup, attribute list, box size, locators. */
export function describeElement(el) {
	const rect = el.getBoundingClientRect();
	return {
		markup: serializeElement(el),
		attributes: Array.from(el.attributes ?? []).map((a) => ({ name: a.name, value: a.value })),
		box: { width: Math.round(rect.width), height: Math.round(rect.height) },
		locators: generateLocators(el)
	};
}

const CSS_IDENT = /^[A-Za-z_-][\w-]*$/;
// A class or id that's mostly hashed noise (framework-generated) makes a brittle
// selector, skip it in favour of something a human wrote.
const LOOKS_GENERATED = (s) =>
	/(^|[-_])[a-z]?\d{4,}/i.test(s) || /^[a-z]{1,3}[A-Z0-9]{5,}$/.test(s);
const TESTID_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];

function cssEscape(v) {
	return window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&');
}

function isUnique(doc, selector) {
	try {
		return doc.querySelectorAll(selector).length === 1;
	} catch {
		return false;
	}
}

function accessibleName(el) {
	const aria = el.getAttribute('aria-label');
	if (aria && aria.trim()) return aria.trim();
	const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
	return text.length > 0 && text.length <= 60 ? text : '';
}

function roleOf(el) {
	const explicit = el.getAttribute('role');
	if (explicit) return explicit;
	const tag = el.tagName.toLowerCase();
	const map = {
		a: el.hasAttribute('href') ? 'link' : '',
		button: 'button',
		input:
			{ checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button' }[el.type] ??
			'textbox',
		select: 'combobox',
		textarea: 'textbox',
		h1: 'heading',
		h2: 'heading',
		h3: 'heading',
		nav: 'navigation',
		img: 'img'
	};
	return map[tag] ?? '';
}

function cssPath(el) {
	const parts = [];
	let node = el;
	while (node && node.nodeType === ELEMENT_NODE && parts.length < 5) {
		let part = node.tagName.toLowerCase();
		const parent = node.parentElement;
		if (parent) {
			const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
			if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
		}
		parts.unshift(part);
		if (parent && (parent === node.ownerDocument.body || parts.length >= 5)) break;
		node = parent;
	}
	return parts.join(' > ');
}

function xPath(el) {
	const parts = [];
	let node = el;
	while (node && node.nodeType === ELEMENT_NODE && node !== node.ownerDocument.documentElement) {
		const tag = node.tagName.toLowerCase();
		const parent = node.parentElement;
		const sameTag = parent
			? [...parent.children].filter((c) => c.tagName === node.tagName)
			: [node];
		const idx = sameTag.length > 1 ? `[${sameTag.indexOf(node) + 1}]` : '';
		parts.unshift(`${tag}${idx}`);
		node = parent;
	}
	return '//' + parts.join('/');
}

/**
 * Ranked selector candidates for a captured element, closest to Playwright's
 * locator priority: test id → role+name → unique id/class → CSS path → XPath.
 * Each is checked for uniqueness against the recorded document so the UI can
 * flag which ones actually resolve to exactly this node.
 */
export function generateLocators(el) {
	if (!el || el.nodeType !== ELEMENT_NODE) return [];
	const doc = el.ownerDocument;
	const out = [];
	// `unique` only means something for CSS-ish selectors we can test with
	// querySelectorAll, leave it undefined for Playwright locators and XPath.
	const CSS_KINDS = new Set(['testid', 'id', 'class', 'css']);
	const add = (kind, label, value, playwright) => {
		if (!value) return;
		out.push({
			kind,
			label,
			value,
			playwright,
			unique: CSS_KINDS.has(kind) ? isUnique(doc, value) : undefined
		});
	};

	for (const attr of TESTID_ATTRS) {
		const v = el.getAttribute(attr);
		if (v) {
			add('testid', attr, `[${attr}="${cssEscape(v)}"]`, null);
			if (attr === 'data-testid') add('playwright', 'Playwright', `getByTestId('${v}')`, true);
		}
	}

	const id = el.getAttribute('id');
	if (id && CSS_IDENT.test(id) && !LOOKS_GENERATED(id)) add('id', 'id', `#${cssEscape(id)}`, null);

	const role = roleOf(el);
	const name = accessibleName(el);
	if (role && name) {
		add(
			'playwright',
			'Playwright',
			`getByRole('${role}', { name: ${JSON.stringify(name)} })`,
			true
		);
	} else if (name && el.tagName.toLowerCase() !== 'html') {
		add('playwright', 'Playwright', `getByText(${JSON.stringify(name)})`, true);
	}

	const tag = el.tagName.toLowerCase();
	for (const cls of el.classList ?? []) {
		if (CSS_IDENT.test(cls) && !LOOKS_GENERATED(cls)) {
			const sel = `${tag}.${cssEscape(cls)}`;
			if (isUnique(doc, sel)) {
				add('class', 'class', sel, null);
				break;
			}
		}
	}

	add('css', 'CSS path', cssPath(el), null);
	add('xpath', 'XPath', xPath(el), null);

	// Recommended = the first uniquely-resolving CSS-ish candidate, else the first
	// Playwright locator.
	const rec = out.find((l) => l.unique === true) ?? out.find((l) => l.playwright);
	if (rec) rec.recommended = true;
	return out;
}

function looksLikeXPath(q) {
	return /^\(?\.?\/\//.test(q.trim());
}

/**
 * Finds nodes in the recorded document. A query starting with `//` runs as
 * XPath, one that parses as a CSS selector runs as `querySelectorAll`, anything
 * else is a keyword match against tag name, id, classes, attribute values and
 * direct text. Returns `{ kind, nodes, error }`.
 */
export function searchDom(doc, rawQuery) {
	const query = (rawQuery ?? '').trim();
	if (!doc || !query) return { kind: 'empty', nodes: [] };

	if (looksLikeXPath(query)) {
		try {
			const res = doc.evaluate(query, doc, null, 7 /* ORDERED_SNAPSHOT */, null);
			const nodes = [];
			for (let i = 0; i < res.snapshotLength; i++) {
				const n = res.snapshotItem(i);
				if (n && n.nodeType === ELEMENT_NODE) nodes.push(n);
			}
			return { kind: 'xpath', nodes };
		} catch (e) {
			return { kind: 'xpath', nodes: [], error: e.message };
		}
	}

	if (/[.#[\]>:*=]/.test(query) && !/\s{2,}/.test(query)) {
		try {
			const nodes = [...doc.querySelectorAll(query)];
			if (nodes.length > 0) return { kind: 'css', nodes };
		} catch {
			// fall through to keyword
		}
	}

	const needle = query.toLowerCase();
	const nodes = [];
	for (const el of doc.querySelectorAll('*')) {
		const hay = [
			el.tagName,
			el.id,
			el.className && el.className.baseVal ? el.className.baseVal : el.className,
			...Array.from(el.attributes ?? []).map((a) => a.value),
			nodeTextPreview(el)
		]
			.join(' ')
			.toLowerCase();
		if (hay.includes(needle)) nodes.push(el);
	}
	return { kind: 'keyword', nodes };
}
