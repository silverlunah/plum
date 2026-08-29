/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import * as htmlToImage from 'html-to-image';
import fixWebmDuration from 'fix-webm-duration';
import { collectFontEmbedCSS } from './replayCapture';

const FPS = 12;
const TAIL_MS = 400;

const supportedMime = () =>
	['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
		MediaRecorder.isTypeSupported(m)
	);

/**
 * Records the already-loaded replayer to a WebM blob in the browser — nothing is
 * uploaded. Plays it through in real time (so a mid-recording navigation applies
 * the same as normal playback) while html-to-image snapshots each frame onto a
 * canvas the MediaRecorder samples at FPS; a slow snapshot just repeats the
 * previous frame, so the clip stays the right length.
 *
 * A second rrweb player can't be spun up off-screen for this (two instances
 * fight over shared module state and the hidden one renders blank), so it drives
 * the visible replayer and the caller restores its position afterwards.
 */
export async function renderReplayToWebM({ replayer, durationMs, onProgress, shouldCancel }) {
	const iframe = replayer?.iframe;
	if (!iframe?.contentDocument?.documentElement) throw new Error('The replay is not ready yet.');
	if (!durationMs || durationMs < 200) throw new Error('This recording is too short to record.');
	if (typeof MediaRecorder === 'undefined') throw new Error("This browser can't record video.");
	const mime = supportedMime();
	if (!mime) throw new Error("This browser can't record WebM video.");

	const w = Math.max(320, iframe.offsetWidth || 1280);
	const h = Math.max(240, iframe.offsetHeight || 720);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	const paintWhite = () => {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, w, h);
	};
	paintWhite();

	const fontEmbedCSS = await collectFontEmbedCSS(iframe.contentDocument).catch(() => '');

	const recorder = new MediaRecorder(canvas.captureStream(FPS), {
		mimeType: mime,
		videoBitsPerSecond: 3_500_000
	});
	const chunks = [];
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	const stopped = new Promise((res) => (recorder.onstop = res));
	recorder.start(250);

	replayer.play(0);
	const start = performance.now();
	let capturing = false;
	let renderedMs = 0;

	try {
		await new Promise((resolve, reject) => {
			function tick() {
				if (shouldCancel?.()) return reject(new Error('Cancelled.'));
				renderedMs = performance.now() - start;
				onProgress?.(Math.min(1, renderedMs / durationMs));

				if (!capturing) {
					capturing = true;
					htmlToImage
						.toCanvas(iframe.contentDocument.documentElement, {
							width: w,
							height: h,
							backgroundColor: '#ffffff',
							fontEmbedCSS
						})
						.then((frame) => {
							paintWhite();
							ctx.drawImage(frame, 0, 0, w, h);
						})
						.catch(() => {})
						.finally(() => {
							capturing = false;
						});
				}

				if (renderedMs >= durationMs + TAIL_MS) resolve();
				else requestAnimationFrame(tick);
			}
			requestAnimationFrame(tick);
		});
	} finally {
		recorder.stop();
		await stopped;
		try {
			replayer.pause(0);
		} catch {
			// caller rebuilds the player anyway
		}
	}

	onProgress?.(1);
	const raw = new Blob(chunks, { type: mime });
	// MediaRecorder WebM carries no duration in its header — players show it as
	// unseekable / 0:00 until playback ends. Patch the EBML so the file behaves.
	return fixWebmDuration(raw, Math.round(renderedMs), { logger: false }).catch(() => raw);
}
