/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// A cheap, no-completion-cost call each provider offers for exactly this: confirm
// a key authenticates before trusting it, rather than storing whatever string
// was pasted and only discovering it's wrong (or a subscription/OAuth token that
// was never a real API key to begin with) on the first real session.
const ANTHROPIC_API_VERSION = '2023-06-01';

async function verifyAnthropicKey(key) {
	const res = await fetch('https://api.anthropic.com/v1/models', {
		headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_API_VERSION },
		signal: AbortSignal.timeout(10000)
	}).catch(() => null);
	if (!res || !res.ok) {
		const e = new Error(
			"Anthropic rejected this API key. Make sure it's a Console API key (starts with " +
				"sk-ant-), not a Claude.ai subscription login - those aren't interchangeable."
		);
		e.status = 400;
		throw e;
	}
}

async function verifyOpenAiKey(key) {
	const res = await fetch('https://api.openai.com/v1/models', {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(10000)
	}).catch(() => null);
	if (!res || !res.ok) {
		const e = new Error("OpenAI rejected this API key. Check it hasn't expired or been revoked.");
		e.status = 400;
		throw e;
	}
}

module.exports = { verifyAnthropicKey, verifyOpenAiKey };
