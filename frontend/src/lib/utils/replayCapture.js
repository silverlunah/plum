/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import * as htmlToImage from 'html-to-image';

function toBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

const fontMime = (url) =>
	url.includes('woff2') ? 'font/woff2' : url.includes('woff') ? 'font/woff' : 'font/ttf';

const FONT_FACE_RE = /@font-face\s*{[^}]*}/g;

async function faceTextsFromHref(href) {
	if (!href) return [];
	try {
		const css = await fetch(href).then((r) => r.text());
		return css.match(FONT_FACE_RE) ?? [];
	} catch {
		return [];
	}
}

// html-to-image's own font embedding misses @font-face rules from a cross-origin
// stylesheet (the tested page's Google Fonts <link>) — the capture then falls
// back to a default face. Re-fetch the CORS-blocked sheets by URL ourselves.
export async function collectFontEmbedCSS(doc) {
	const rules = [];
	for (const sheet of doc.styleSheets) {
		let cssRules;
		try {
			cssRules = sheet.cssRules;
		} catch {
			rules.push(...(await faceTextsFromHref(sheet.href)));
			continue;
		}
		for (const rule of cssRules) {
			if (rule.type === 5 || rule.constructor?.name === 'CSSFontFaceRule') {
				rules.push(rule.cssText);
			} else if (rule.type === 3 && rule.href) {
				let reachable = true;
				try {
					void rule.styleSheet.cssRules;
				} catch {
					reachable = false;
				}
				if (!reachable) rules.push(...(await faceTextsFromHref(rule.href)));
			}
		}
	}

	const cache = new Map();
	const out = [];
	for (let text of rules) {
		const urls = [...text.matchAll(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/g)].map((m) => m[2]);
		for (const url of urls) {
			try {
				if (!cache.has(url)) {
					const buf = await fetch(url).then((r) => r.arrayBuffer());
					cache.set(url, `data:${fontMime(url)};base64,${toBase64(buf)}`);
				}
				text = text.split(url).join(cache.get(url));
			} catch {
				// unreachable font — leave the original url, the face just won't embed
			}
		}
		out.push(text);
	}
	return out.join('\n');
}

/** PNG blob of whatever the given rrweb replayer is currently showing. */
export async function captureReplayFrame(replayer) {
	const doc = replayer?.iframe?.contentDocument;
	if (!doc?.documentElement) throw new Error('Nothing to capture yet — let the replay load first.');
	const fontEmbedCSS = await collectFontEmbedCSS(doc).catch(() => '');
	const blob = await htmlToImage.toBlob(doc.documentElement, {
		backgroundColor: '#ffffff',
		fontEmbedCSS
	});
	if (!blob) throw new Error('Could not capture this frame.');
	return blob;
}
