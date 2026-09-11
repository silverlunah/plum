/*
 * This file is part of Plum.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Turns the raw, provider-specific turn result from aiAgentService.runTurn()
// into one shape the frontend renders generically: a flat list of
// { role: 'assistant'|'system', blocks: [...] }, where each block is one of
// { type: 'text'|'thinking', text } or
// { type: 'tool_call', id, name, input, output, image, status: 'pending'|'done'|'error' } or
// { type: 'result'|'error', text }.

function blockText(content) {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.filter((b) => b.type === 'text')
		.map((b) => b.text)
		.join('\n');
}

// Playwright MCP's screenshot tool returns an image content block alongside
// (or instead of) text, this is the only "live browser" view the Anthropic
// adapter gets (see runOpenAiTurn's comment, OpenAI has no browser MCP at
// all), so it's pulled out separately for the frontend's Browser panel.
function blockImage(content) {
	if (!Array.isArray(content)) return null;
	const img = content.find((b) => b.type === 'image' && b.source?.type === 'base64');
	return img ? `data:${img.source.media_type};base64,${img.source.data}` : null;
}

function normalizeAnthropic(events) {
	const messages = [];
	const toolCallsById = new Map();

	for (const evt of events) {
		if (evt.type === 'assistant') {
			const blocks = [];
			for (const block of evt.message.content) {
				if (block.type === 'text') {
					blocks.push({ type: 'text', text: block.text });
				} else if (block.type === 'thinking') {
					blocks.push({ type: 'thinking', text: block.thinking });
				} else if (block.type === 'tool_use') {
					const call = {
						type: 'tool_call',
						id: block.id,
						name: block.name,
						input: block.input,
						output: null,
						image: null,
						status: 'pending'
					};
					toolCallsById.set(block.id, call);
					blocks.push(call);
				}
			}
			if (blocks.length) messages.push({ role: 'assistant', blocks });
		} else if (evt.type === 'user') {
			const content = evt.message.content;
			if (!Array.isArray(content)) continue;
			for (const block of content) {
				if (block.type !== 'tool_result') continue;
				const call = toolCallsById.get(block.tool_use_id);
				if (!call) continue;
				call.status = block.is_error ? 'error' : 'done';
				call.output = blockText(block.content);
				call.image = blockImage(block.content);
			}
		} else if (evt.type === 'result') {
			messages.push({
				role: 'system',
				blocks: [
					evt.subtype === 'success'
						? { type: 'result', text: evt.result }
						: { type: 'error', text: `Agent run failed: ${evt.subtype}` }
				]
			});
		}
	}

	return messages;
}

function normalizeOpenAi(response) {
	const messages = [];
	const blocks = [];

	for (const item of response.output || []) {
		if (item.type === 'message') {
			for (const block of item.content || []) {
				if (block.type === 'output_text') blocks.push({ type: 'text', text: block.text });
				else if (block.type === 'refusal') blocks.push({ type: 'error', text: block.refusal });
			}
		} else if (item.type === 'mcp_call') {
			let input = item.arguments;
			try {
				input = JSON.parse(item.arguments);
			} catch {
				// arguments wasn't valid JSON, keep the raw string
			}
			blocks.push({
				type: 'tool_call',
				id: item.id,
				name: item.name,
				input,
				output: item.output ?? null,
				image: null,
				status: item.error ? 'error' : item.output != null ? 'done' : 'pending'
			});
		} else if (item.type === 'reasoning') {
			const text = (item.summary || []).map((s) => s.text).join('\n');
			if (text) blocks.push({ type: 'thinking', text });
		}
	}

	if (blocks.length) messages.push({ role: 'assistant', blocks });

	if (response.status === 'incomplete' || response.status === 'failed') {
		messages.push({
			role: 'system',
			blocks: [
				{
					type: 'error',
					text: response.incomplete_details?.reason || response.error?.message || 'Agent run failed'
				}
			]
		});
	}

	return messages;
}

// `result` is aiAgentService.runTurn()'s return value: { events } for
// Anthropic, { response } for OpenAI.
function normalizeTurn(provider, result) {
	const messages =
		provider === 'openai' ? normalizeOpenAi(result.response) : normalizeAnthropic(result.events);
	return { messages };
}

// The key to pass back on the next turn for provider-side conversation
// continuity: the Claude Agent SDK's own session_id (as `resume`), or the
// OpenAI Response's id (as `previous_response_id`).
function extractResumeKey(provider, result) {
	if (provider === 'openai') return result.response.id;
	const last = result.events[result.events.length - 1];
	return last?.session_id || null;
}

module.exports = { normalizeTurn, extractResumeKey };
