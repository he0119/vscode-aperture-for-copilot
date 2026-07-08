import assert from 'node:assert/strict';
import type { ChatCompletionRequest, StreamCallbacks } from '../src/types';
import { ApertureClient } from '../src/client';

const originalFetch = globalThis.fetch;

after(() => {
	globalThis.fetch = originalFetch;
});

describe('ApertureClient', () => {
	it('sends chat completions requests and dispatches stream events', async () => {
	let capturedUrl = '';
	let capturedInit: RequestInit | undefined;
	globalThis.fetch = (async (url, init) => {
		capturedUrl = String(url);
		capturedInit = init;
		return sseResponse([
			'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}',
			'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}',
			'data: [DONE]',
			'',
		]);
	}) as typeof fetch;

	const events: unknown[] = [];
	const client = new ApertureClient('https://aperture.example.com/root', 'agent/1');
	await client.streamChatCompletion(sampleRequest(), callbacksFor(events), token());

	assert.equal(capturedUrl, 'https://aperture.example.com/root/v1/chat/completions');
	assert.equal(capturedInit?.method, 'POST');
	assert.deepEqual(capturedInit?.headers, {
		'Content-Type': 'application/json',
		'User-Agent': 'agent/1',
	});
	assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
		model: 'model-a',
		messages: [{ role: 'user', content: 'hello' }],
		stream: true,
		stream_options: { include_usage: true },
	});
	assert.deepEqual(events, [
		['content', 'hi'],
		['usage', { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }],
		['done'],
	]);
});

	it('reports HTTP failures through the error callback', async () => {
	globalThis.fetch = (async () =>
		new Response('not authorized', { status: 401 })) as typeof fetch;

	const errors: Error[] = [];
	const client = new ApertureClient('https://aperture.example.com', 'agent/1');
	await client.streamChatCompletion(
		sampleRequest(),
		{
			...callbacksFor([]),
			onError: (error: Error) => errors.push(error),
		},
		token(),
	);

	assert.equal(errors.length, 1);
	assert.match(errors[0]?.message ?? '', /HTTP 401: not authorized/u);
});
});

function sampleRequest(): ChatCompletionRequest {
	return {
		model: 'model-a',
		messages: [{ role: 'user', content: 'hello' }],
		stream: true,
	};
}

function callbacksFor(events: unknown[]): StreamCallbacks {
	return {
		onContent: (content) => events.push(['content', content]),
		onReasoning: (content) => events.push(['reasoning', content]),
		onToolCall: (toolCall) => events.push(['toolCall', toolCall]),
		onUsage: (usage) => events.push(['usage', usage]),
		onDone: () => events.push(['done']),
		onError: (error) => {
			throw error;
		},
	};
}

function token() {
	return {
		isCancellationRequested: false,
		onCancellationRequested: () => ({ dispose: () => undefined }),
	};
}

function sseResponse(lines: readonly string[]): Response {
	const encoder = new TextEncoder();
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(lines.join('\n')));
			controller.close();
		},
	});
	return new Response(body, { status: 200 });
}
