import assert from 'node:assert/strict';
import { buildProtocolRequest } from '../../src/api/protocol';
import { AnthropicStreamParser, ResponsesStreamParser } from '../../src/api/streamParser';
import type { ChatCompletionRequest } from '../../src/api/types';

describe('API protocols', () => {
	const request: ChatCompletionRequest = {
		model: 'model-a', stream: true, max_tokens: 100,
		messages: [
			{ role: 'system', content: 'Be useful' },
			{ role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } }] },
			{ role: 'tool', content: 'result', tool_call_id: 'call-1' },
		],
		tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }],
	};

	it('builds OpenAI Responses requests', () => {
		const built = buildProtocolRequest(request, 'responses');
		assert.equal(built.path, '/responses');
		const body = built.body as { input: Array<Record<string, unknown>>; max_output_tokens: number };
		assert.equal(body.max_output_tokens, 100);
		assert.ok(body.input.some((item) => item.type === 'function_call'));
		assert.ok(body.input.some((item) => item.type === 'function_call_output'));
	});

	it('builds Anthropic Messages requests', () => {
		const built = buildProtocolRequest(request, 'anthropic-messages');
		assert.equal(built.path, '/messages');
		assert.equal(built.headers?.['anthropic-version'], '2023-06-01');
		const body = built.body as { system: string; messages: Array<{ role: string }> };
		assert.equal(body.system, 'Be useful');
		assert.ok(body.messages.every((message) => message.role !== 'system'));
	});

	it('parses Responses text, tools, and usage', () => {
		const parser = new ResponsesStreamParser();
		const events = parser.push([
			'data: {"type":"response.output_text.delta","delta":"hi"}',
			'data: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"c1","name":"lookup","arguments":""}}',
			'data: {"type":"response.function_call_arguments.delta","call_id":"c1","delta":"{}"}',
			'data: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3}}}', ''
		].join('\n'));
		assert.deepEqual(events.map((event) => event.type), ['content', 'toolCall', 'usage', 'done']);
	});

	it('parses Anthropic content, thinking, tools, and usage', () => {
		const parser = new AnthropicStreamParser();
		const events = parser.push([
			'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
			'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"hi"}}',
			'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"c1","name":"lookup"}}',
			'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
			'data: {"type":"message_delta","usage":{"output_tokens":3}}',
			'data: {"type":"message_stop"}', ''
		].join('\n'));
		assert.deepEqual(events.map((event) => event.type), ['reasoning', 'content', 'usage', 'toolCall', 'done']);
	});
});
