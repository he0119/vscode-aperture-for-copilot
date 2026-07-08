import assert from 'node:assert/strict';
import { OpenAIStreamParser } from '../src/streamParser';

describe('OpenAIStreamParser', () => {
	it('parses content, reasoning, usage, and done', () => {
		const parser = new OpenAIStreamParser();
		const events = parser.push(
			[
				'data: {"choices":[{"delta":{"reasoning_content":"think"},"finish_reason":null}],"usage":null}',
				'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}',
				'data: [DONE]',
				'',
			].join('\n'),
		);

		assert.deepEqual(events, [
			{ type: 'reasoning', value: 'think' },
			{ type: 'usage', value: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
			{ type: 'content', value: 'hi' },
			{ type: 'done' },
		]);
	});

	it('accumulates streaming tool calls', () => {
		const parser = new OpenAIStreamParser();
		const events = parser.push(
			[
				'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"ping_","arguments":"{\\"value\\""}}]},"finish_reason":null}]}',
				'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"tool","arguments":":\\"ok\\"}"}}]},"finish_reason":"tool_calls"}]}',
				'data: [DONE]',
				'',
			].join('\n'),
		);

		assert.equal(events.length, 2);
		assert.deepEqual(events[0], {
			type: 'toolCall',
			value: {
				id: 'call_1',
				type: 'function',
				function: {
					name: 'ping_tool',
					arguments: '{"value":"ok"}',
				},
			},
		});
		assert.deepEqual(events[1], { type: 'done' });
	});
});
