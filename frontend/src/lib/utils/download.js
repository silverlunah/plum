/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoking synchronously can cancel the download in some browsers.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameFromDisposition(header, fallback) {
	const match = /filename="?([^"]+)"?/.exec(header ?? '');
	return match ? match[1] : fallback;
}

export async function downloadFromEndpoint(url, { headers = {}, fallbackName = 'export' } = {}) {
	const res = await fetch(url, { headers });
	if (!res.ok) throw new Error('Export failed');
	const blob = await res.blob();
	downloadBlob(blob, filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName));
}
