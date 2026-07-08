import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { ApertureChatProvider } from '../../src/provider/chatProvider';
import type { ChatCompletionRequest } from '../../src/shared/types';
import { resetApertureConfig, updateApertureConfig } from '../helpers/config';

const originalFetch = globalThis.fetch;
const providerSubscriptions: vscode.Disposable[][] = [];

afterEach(async () => {
	globalThis.fetch = originalFetch;
	for (const subscriptions of providerSubscriptions.splice(0)) {
		for (const subscription of subscriptions.splice(0)) {
			subscription.dispose();
		}
	}
	await resetApertureConfig();
});

describe('ApertureChatProvider', () => {
	it('provides manual model information and token counts', async () => {
		await updateApertureConfig({
			modelSource: 'manual',
			models: [
				{
					id: 'deepseek-v4-pro',
					apiModelId: 'deepseek-api',
					name: 'DeepSeek V4 Pro',
					detail: 'Manual detail',
					maxInputTokens: 1234,
					maxOutputTokens: 567,
					toolCalling: 3,
					thinking: true,
				},
			],
		});
		const provider = createProvider();

		const info = await provider.provideLanguageModelChatInformation(
			{ silent: false },
			cancellationToken(),
		);

		assert.equal(info.length, 1);
		assert.equal(info[0]?.id, 'deepseek-v4-pro');
		assert.equal(info[0]?.name, 'DeepSeek V4 Pro');
		assert.equal(info[0]?.detail, 'Manual detail');
		assert.equal(info[0]?.maxInputTokens, 1234);
		assert.equal(info[0]?.maxOutputTokens, 567);
		assert.deepEqual(info[0]?.capabilities, {
			toolCalling: 3,
			imageInput: false,
		});
		assert.deepEqual(
			configurationSchema(info[0]).properties.reasoningEffort.enum,
			['auto', 'none', 'high', 'max'],
		);

		assert.equal(await provider.provideTokenCount(info[0]!, '12345', cancellationToken()), 2);
		assert.equal(
			await provider.provideTokenCount(
				info[0]!,
				vscode.LanguageModelChatMessage.User([
					new vscode.LanguageModelTextPart('abcdef'),
					vscode.LanguageModelDataPart.text('ignored'),
				]),
				cancellationToken(),
			),
			2,
		);

		await provider.prepareForDeactivate();
		assert.deepEqual(
			await provider.provideLanguageModelChatInformation({ silent: false }, cancellationToken()),
			[],
		);
	});

	it('builds chat completion requests and reports streamed response parts', async () => {
		await updateApertureConfig({
			baseUrl: 'https://aperture.example.com',
			modelSource: 'manual',
			models: [
				{
					id: 'deepseek-v4-pro',
					apiModelId: 'deepseek-api',
					toolCalling: 2,
					thinking: true,
				},
			],
			maxTokens: 99,
		});
		let capturedUrl = '';
		let capturedHeaders: HeadersInit | undefined;
		let capturedRequest: ChatCompletionRequest | undefined;
		globalThis.fetch = (async (url, init) => {
			capturedUrl = String(url);
			capturedHeaders = init?.headers;
			capturedRequest = JSON.parse(String(init?.body)) as ChatCompletionRequest;
			return sseResponse([
				'data: {"choices":[{"delta":{"reasoning_content":"think"},"finish_reason":null}]}',
				'data: {"choices":[{"delta":{"content":"hi","tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\\"value\\":\\"ok\\"}"}}]},"finish_reason":"tool_calls"}]}',
				'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":7,"total_tokens":12,"prompt_cache_hit_tokens":3}}',
				'data: [DONE]',
				'',
			]);
		}) as typeof fetch;
		const provider = createProvider();
		const reported: vscode.LanguageModelResponsePart[] = [];

		await provider.provideLanguageModelChatResponse(
			{ id: 'deepseek-v4-pro' } as vscode.LanguageModelChatInformation,
			[vscode.LanguageModelChatMessage.User('hello')],
			{
				tools: [tool('lookup')],
				toolMode: vscode.LanguageModelChatToolMode.Auto,
				modelConfiguration: { reasoningEffort: 'high' },
				sessionId: 'chat-session-1',
			} as vscode.ProvideLanguageModelChatResponseOptions,
			{ report: (part) => reported.push(part) },
			cancellationToken(),
		);

		assert.equal(capturedUrl, 'https://aperture.example.com/v1/chat/completions');
		assert.equal(
			getHeader(capturedHeaders, 'X-Session-Affinity'),
			expectedAffinity('runtime:sessionId:chat-session-1'),
		);
		assert.deepEqual(capturedRequest, {
			model: 'deepseek-api',
			messages: [{ role: 'user', content: 'hello' }],
			stream: true,
			tools: [
				{
					type: 'function',
					function: {
						name: 'lookup',
						description: 'Lookup data',
						parameters: { type: 'object' },
					},
				},
			],
			tool_choice: 'auto',
			max_tokens: 99,
			thinking: { type: 'enabled' },
			reasoning_effort: 'high',
			stream_options: { include_usage: true },
		});

		const textValues = reported
			.filter((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)
			.map((part) => part.value);
		assert.ok(textValues.includes('hi'));
		const toolPart = reported.find(
			(part): part is vscode.LanguageModelToolCallPart =>
				part instanceof vscode.LanguageModelToolCallPart,
		);
		assert.equal(toolPart?.callId, 'call_1');
		assert.equal(toolPart?.name, 'lookup');
		assert.deepEqual(toolPart?.input, { value: 'ok' });

		const usagePart = reported.find(
			(part): part is vscode.LanguageModelDataPart => part instanceof vscode.LanguageModelDataPart,
		);
		assert.equal(usagePart?.mimeType, 'usage');
		assert.deepEqual(JSON.parse(new TextDecoder().decode(usagePart?.data)), {
			prompt_tokens: 5,
			completion_tokens: 7,
			total_tokens: 12,
			prompt_tokens_details: {
				cached_tokens: 3,
			},
		});
	});

	it('rejects missing configuration, unavailable models, and excessive tools', async () => {
		await updateApertureConfig({
			modelSource: 'manual',
			models: [{ id: 'model-a', toolCalling: 1 }],
		});
		const provider = createProvider();

		await assert.rejects(
			() =>
				provider.provideLanguageModelChatResponse(
					{ id: 'model-a' } as vscode.LanguageModelChatInformation,
					[vscode.LanguageModelChatMessage.User('hello')],
					{ toolMode: vscode.LanguageModelChatToolMode.Auto },
					{ report: () => undefined },
					cancellationToken(),
				),
			/base URL is not configured/u,
		);

		await updateApertureConfig({ baseUrl: 'https://aperture.example.com' });
		provider.refreshModels();
		await assert.rejects(
			() =>
				provider.provideLanguageModelChatResponse(
					{ id: 'missing' } as vscode.LanguageModelChatInformation,
					[vscode.LanguageModelChatMessage.User('hello')],
					{ toolMode: vscode.LanguageModelChatToolMode.Auto },
					{ report: () => undefined },
					cancellationToken(),
				),
			/no longer available/u,
		);

		await assert.rejects(
			() =>
				provider.provideLanguageModelChatResponse(
					{ id: 'model-a' } as vscode.LanguageModelChatInformation,
					[vscode.LanguageModelChatMessage.User('hello')],
					{
						tools: [tool('one'), tool('two')],
						toolMode: vscode.LanguageModelChatToolMode.Auto,
					},
					{ report: () => undefined },
					cancellationToken(),
				),
			/supports at most 1 tools/u,
		);
	});
});

function createProvider(): ApertureChatProvider {
	const subscriptions: vscode.Disposable[] = [];
	providerSubscriptions.push(subscriptions);
	return new ApertureChatProvider({
		subscriptions,
		extension: {
			packageJSON: {
				name: 'aperture-for-copilot',
				version: '0.1.1',
			},
		},
	} as unknown as vscode.ExtensionContext);
}

function cancellationToken(): vscode.CancellationToken {
	const source = new vscode.CancellationTokenSource();
	providerSubscriptions.push([source]);
	return source.token;
}

function expectedAffinity(value: string): string {
	return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}

function getHeader(headers: HeadersInit | undefined, name: string): string | undefined {
	if (!headers || Array.isArray(headers) || headers instanceof Headers) {
		return headers instanceof Headers ? (headers.get(name) ?? undefined) : undefined;
	}
	return headers[name];
}

function configurationSchema(info: vscode.LanguageModelChatInformation): {
	properties: { reasoningEffort: { enum: string[] } };
} {
	return (info as unknown as {
		configurationSchema: { properties: { reasoningEffort: { enum: string[] } } };
	}).configurationSchema;
}

function tool(name: string): vscode.LanguageModelChatTool {
	return {
		name,
		description: 'Lookup data',
		inputSchema: { type: 'object' },
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
