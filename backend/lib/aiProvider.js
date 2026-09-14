/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// One tool-calling loop per provider over the shared specs in lib/aiTools.js.
// Both run in-process, so neither provider needs a URL that reaches back in.

const { Anthropic } = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const settingsService = require('../services/settingsService');
const { AI_PROVIDER, DEFAULT_AI_MODEL } = require('../constants/ai');

const MAX_OUTPUT_TOKENS = 8192;
const IMAGE_MIME_TYPE = 'image/png';

async function resolveProvider() {
	const org = await settingsService.getOrgRaw();
	if (org.anthropicApiKey) {
		return {
			provider: AI_PROVIDER.ANTHROPIC,
			apiKey: org.anthropicApiKey,
			model: org.anthropicModel || DEFAULT_AI_MODEL[AI_PROVIDER.ANTHROPIC]
		};
	}
	if (org.openaiApiKey) {
		return {
			provider: AI_PROVIDER.OPENAI,
			apiKey: org.openaiApiKey,
			model: org.openaiModel || DEFAULT_AI_MODEL[AI_PROVIDER.OPENAI]
		};
	}
	const e = new Error('No AI provider is connected. Add a key in Settings → Integrations.');
	e.status = 400;
	throw e;
}

// Fed back as an error result, not thrown: a bad path is recoverable next turn.
async function callTool(tools, name, args) {
	const tool = tools.find((t) => t.name === name);
	if (!tool) return { output: `No such tool: ${name}`, isError: true };
	try {
		const out = await tool.handler(args ?? {});
		return { output: typeof out === 'string' ? out : JSON.stringify(out), isError: false };
	} catch (e) {
		return { output: e.message || 'Tool call failed', isError: true };
	}
}

async function runAnthropic({
	apiKey,
	model,
	systemPrompt,
	prompt,
	images,
	tools,
	maxRounds,
	isDone
}) {
	const client = new Anthropic({ apiKey });
	const toolDefs = tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: t.parameters
	}));
	const content = [
		{ type: 'text', text: prompt },
		...images.map((data) => ({
			type: 'image',
			source: { type: 'base64', media_type: IMAGE_MIME_TYPE, data }
		}))
	];
	const messages = [{ role: 'user', content }];
	let text = '';

	for (let round = 0; round < maxRounds; round++) {
		const res = await client.messages.create({
			model,
			max_tokens: MAX_OUTPUT_TOKENS,
			system: systemPrompt,
			tools: toolDefs,
			messages
		});
		const said = res.content
			.filter((b) => b.type === 'text')
			.map((b) => b.text)
			.join('\n');
		if (said) text = said;

		const uses = res.content.filter((b) => b.type === 'tool_use');
		if (uses.length === 0) return text;

		messages.push({ role: 'assistant', content: res.content });
		const results = [];
		for (const use of uses) {
			const { output, isError } = await callTool(tools, use.name, use.input);
			results.push({
				type: 'tool_result',
				tool_use_id: use.id,
				content: output,
				is_error: isError
			});
		}
		messages.push({ role: 'user', content: results });
		if (isDone?.()) return text;
	}
	return text;
}

async function runOpenAi({
	apiKey,
	model,
	systemPrompt,
	prompt,
	images,
	tools,
	maxRounds,
	isDone
}) {
	const client = new OpenAI({ apiKey });
	const toolDefs = tools.map((t) => ({
		type: 'function',
		name: t.name,
		description: t.description,
		parameters: t.parameters,
		strict: false
	}));
	const content = [
		{ type: 'input_text', text: prompt },
		...images.map((data) => ({
			type: 'input_image',
			image_url: `data:${IMAGE_MIME_TYPE};base64,${data}`
		}))
	];
	let input = [{ role: 'user', content }];
	let previousResponseId;
	let text = '';

	for (let round = 0; round < maxRounds; round++) {
		const res = await client.responses.create({
			model,
			instructions: systemPrompt,
			tools: toolDefs,
			input,
			previous_response_id: previousResponseId
		});
		previousResponseId = res.id;
		if (res.output_text) text = res.output_text;

		const calls = (res.output || []).filter((o) => o.type === 'function_call');
		if (calls.length === 0) return text;

		input = [];
		for (const call of calls) {
			let args = {};
			try {
				args = JSON.parse(call.arguments || '{}');
			} catch {
				// Malformed arguments reach the handler as {}, which it rejects itself.
			}
			const { output } = await callTool(tools, call.name, args);
			input.push({ type: 'function_call_output', call_id: call.call_id, output });
		}
		if (isDone?.()) return text;
	}
	return text;
}

// `images` are base64 PNGs attached to the opening message. `isDone` lets a
// terminal tool end the loop early; `maxRounds` is the runaway guard.
async function runAgent({
	provider,
	apiKey,
	model,
	systemPrompt,
	prompt,
	images = [],
	tools,
	maxRounds,
	isDone
}) {
	const args = { apiKey, model, systemPrompt, prompt, images, tools, maxRounds, isDone };
	return provider === AI_PROVIDER.OPENAI ? runOpenAi(args) : runAnthropic(args);
}

module.exports = { resolveProvider, runAgent };
