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

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// Same mime type is matched by string literal in backend/services/reportService.js
// (processCucumberJson) — the two runtimes don't share a module, mirroring how
// 'image/png' is already duplicated between this file and reportService.js.
const RRWEB_MIME_TYPE = 'application/x-plum-rrweb+json';
// @rrweb/record's package.json only exports its main entry ("."), so a deep
// require.resolve() of the UMD bundle is blocked by Node's exports map — resolve
// the (exported) main entry instead and locate the sibling file on disk.
const RECORD_BUNDLE_PATH = path.join(
	path.dirname(require.resolve('@rrweb/record')),
	'record.umd.min.cjs'
);

interface TabRecording {
	tabId: string;
	tabIndex: number;
	events: unknown[];
}

let _browser: Browser;
let _context: BrowserContext;
let _page: Page;
let _ssCounter = 0;
let _tabs: Map<Page, TabRecording> = new Map();
let _tabCounter = 0;
let _workerId = 1;

export const page = (): Page => _page;

function tabIdForIndex(index: number): string {
	return index === 0 ? 'main' : `tab-${index + 1}`;
}

function attachRecorder(pg: Page): void {
	const tabIndex = _tabCounter++;
	_tabs.set(pg, { tabId: tabIdForIndex(tabIndex), tabIndex, events: [] });
}

export async function setup(): Promise<void> {
	const isHeadless = process.env.IS_HEADLESS?.toLowerCase() !== 'false';
	const browserName = (process.env.BROWSER || 'chromium').toLowerCase();
	const browserType =
		browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
	_browser = await browserType.launch({ headless: isHeadless });
	_context = await _browser.newContext();

	_tabs = new Map();
	_tabCounter = 0;
	// Cucumber forks one OS process per --parallel worker and injects this env
	// var into each — 0-indexed, so display/report as 1-based like the rest of
	// the worker-count UI.
	const parsedWorkerId = parseInt(process.env.CUCUMBER_WORKER_ID ?? '', 10);
	_workerId = Number.isFinite(parsedWorkerId) ? parsedWorkerId + 1 : 1;

	// Context-level exposeBinding/addInitScript apply to every page in the
	// context automatically — current and future (popups, target=_blank tabs) —
	// so recording setup never races a new tab's first navigation.
	await _context.exposeBinding('__plumEmitRRwebEvent', (source, eventJson: string) => {
		const recording = source.page && _tabs.get(source.page);
		if (!recording) return;
		try {
			recording.events.push(JSON.parse(eventJson));
		} catch {
			// malformed event — drop it, recording is best-effort
		}
	});
	await _context.addInitScript({ path: RECORD_BUNDLE_PATH });
	await _context.addInitScript(() => {
		// @ts-ignore — rrwebRecord is injected by the record.umd.min.cjs bundle above
		if (window.rrwebRecord) {
			// @ts-ignore
			window.rrwebRecord.record({
				emit: (event: unknown) => {
					// @ts-ignore — exposed by BrowserContext.exposeBinding above
					window.__plumEmitRRwebEvent(JSON.stringify(event));
				}
			});
		}
	});

	_context.on('page', attachRecorder);
	_page = await _context.newPage();
}

export async function screenshotStep(
	attach: (data: Buffer, mime: string) => Promise<void>
): Promise<void> {
	if (!_page) return;
	try {
		const screenshot = await _page.screenshot({ type: 'png' });
		await attach(screenshot, 'image/png');
	} catch {
		// page may be navigating or already closed
	}
}

export async function streamLiveScreenshot(stepName: string): Promise<void> {
	const ssDir = process.env.PLUM_SS_DIR;
	if (!ssDir || !_page) return;
	try {
		const seq = `${String(Date.now()).padStart(16, '0')}-${String(++_ssCounter).padStart(4, '0')}`;
		const screenshot = await _page.screenshot({ type: 'jpeg', quality: 70 });
		fs.writeFileSync(
			path.join(ssDir, `${seq}.ss.json`),
			JSON.stringify({ stepName, data: screenshot.toString('base64') })
		);
	} catch {
		// ignore — live streaming is best-effort
	}
}

/**
 * Flushes every tab's buffered rrweb events (one per opened tab/popup) as a
 * gzip-compressed attachment. Reuses the same `attach()` → Cucumber JSON
 * `embeddings[]` → processCucumberJson() pipeline that screenshots already
 * travel through, tagged with a mime type reportService can pick out.
 */
export async function flushRecordings(
	attach: (data: Buffer, mime: string) => Promise<void>
): Promise<void> {
	for (const recording of _tabs.values()) {
		if (recording.events.length === 0) continue;
		try {
			const payload = JSON.stringify({
				workerId: _workerId,
				tabId: recording.tabId,
				tabIndex: recording.tabIndex,
				events: recording.events
			});
			const gz = zlib.gzipSync(Buffer.from(payload, 'utf8'));
			await attach(gz, RRWEB_MIME_TYPE);
		} catch {
			// a failed recording flush shouldn't fail the scenario
		}
	}
}

export async function teardown(
	attach: (data: Buffer, mime: string) => Promise<void>,
	failed: boolean
): Promise<void> {
	if (failed && _page) {
		const screenshotDir = 'reports/screenshots';
		if (!fs.existsSync(screenshotDir)) {
			fs.mkdirSync(screenshotDir, { recursive: true });
		}
		const screenshotPath = path.join(screenshotDir, `screenshot_${Date.now()}.png`);
		await _page.screenshot({ path: screenshotPath });
		const screenshotData = fs.readFileSync(screenshotPath);
		await attach(screenshotData, 'image/png');
		fs.unlinkSync(screenshotPath);
	}
	await _browser?.close();
}
