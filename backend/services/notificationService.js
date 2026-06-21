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

const settingsService = require('./settingsService');

function countScenarios(content) {
	try {
		// DB stores the processed format: { features: [{ scenarios: [{ status: 'passed'|'failed' }] }] }
		const features = content?.features ?? (Array.isArray(content) ? content : []);
		let passed = 0;
		let failed = 0;
		let total = 0;
		for (const feature of features) {
			for (const scenario of feature.scenarios ?? []) {
				total++;
				if (scenario.status === 'passed') passed++;
				else failed++;
			}
		}
		return { passed, failed, total };
	} catch {
		return { passed: 0, failed: 0, total: 0 };
	}
}

function buildDiscordPayload({ jobName, status, counts, browser, tags, reportUrl }) {
	const isPass = status === 'PASS';
	// Discord colour integers: green 3066993, red 15158332
	const color = isPass ? 3066993 : 15158332;
	const fields = [
		{ name: 'Status', value: isPass ? '✅  PASS' : '❌  FAIL', inline: true },
		{
			name: 'Results',
			value: `${counts.passed} / ${counts.total} passed`,
			inline: true
		},
		{ name: 'Browser', value: browser ?? 'chromium', inline: true },
		{ name: 'Tags', value: tags || '(all tests)', inline: false }
	];
	if (reportUrl) {
		fields.push({ name: 'Report', value: `[View Report](${reportUrl})`, inline: false });
	}

	const embed = { title: jobName, color, fields, timestamp: new Date().toISOString() };
	if (reportUrl) embed.url = reportUrl;
	return { embeds: [embed] };
}

function buildSlackPayload({ jobName, status, counts, browser, tags, reportUrl }) {
	const isPass = status === 'PASS';
	const icon = isPass ? '✅' : '❌';
	const blocks = [
		{
			type: 'section',
			text: {
				type: 'mrkdwn',
				text: `${icon} *${jobName}* — ${isPass ? 'PASS' : 'FAIL'}\n${counts.passed} / ${counts.total} scenarios passed`
			}
		},
		{
			type: 'section',
			fields: [
				{ type: 'mrkdwn', text: `*Browser:*\n${browser ?? 'chromium'}` },
				{ type: 'mrkdwn', text: `*Tags:*\n${tags || '(all tests)'}` }
			]
		}
	];
	if (reportUrl) {
		blocks.push({
			type: 'actions',
			elements: [
				{
					type: 'button',
					text: { type: 'plain_text', text: 'View Report', emoji: true },
					url: reportUrl
				}
			]
		});
	}
	return { blocks };
}

async function postJson(url, body) {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) {
		console.error(`[notify] Webhook responded ${res.status}: ${url}`);
	}
}

/**
 * Sends Discord and/or Slack notifications for a completed test run.
 *
 * @param {{ jobName: string, status: string, content: object, browser: string,
 *           tags: string, reportId: number|null,
 *           notifyDiscord: boolean, notifySlack: boolean }} opts
 */
async function send({
	jobName,
	status,
	content,
	browser,
	tags,
	reportId,
	notifyDiscord,
	notifySlack
}) {
	if (!notifyDiscord && !notifySlack) return;

	let discordWebhookUrl, slackWebhookUrl, notifyPublicUrl;
	try {
		({ discordWebhookUrl, slackWebhookUrl, notifyPublicUrl } = await settingsService.getWebhooks());
	} catch (e) {
		console.error(`[notify] Could not load webhook settings: ${e.message}`);
		return;
	}

	console.log(`[notify] publicUrl="${notifyPublicUrl}" reportId=${reportId}`);
	const reportUrl =
		notifyPublicUrl && reportId
			? `${notifyPublicUrl.replace(/\/$/, '')}/reports/${reportId}`
			: null;

	const counts = countScenarios(content);
	const data = { jobName, status, counts, browser, tags, reportUrl };

	const tasks = [];
	if (notifyDiscord && discordWebhookUrl) {
		tasks.push(
			postJson(discordWebhookUrl, buildDiscordPayload(data)).catch((e) =>
				console.error(`[notify] Discord failed: ${e.message}`)
			)
		);
	}
	if (notifySlack && slackWebhookUrl) {
		tasks.push(
			postJson(slackWebhookUrl, buildSlackPayload(data)).catch((e) =>
				console.error(`[notify] Slack failed: ${e.message}`)
			)
		);
	}

	await Promise.all(tasks);
}

module.exports = { send };
