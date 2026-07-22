import assert from 'node:assert/strict';
import { ModelService } from '../../src/models/service';
import { resetApertureConfig, updateApertureConfig } from '../helpers/config';

const originalFetch = globalThis.fetch;

afterEach(async () => {
	globalThis.fetch = originalFetch;
	await resetApertureConfig();
});

describe('ModelService', () => {
	it('loads configured models without discovery and caches unchanged results', async () => {
		await updateApertureConfig({
			models: [
				{
					id: 'picker-id',
					apiModelId: 'api-id',
					name: 'Picker Name',
					toolCalling: true,
					thinking: true,
				},
			],
			toolLimit: 42,
		});

		const service = new ModelService('agent/1');
		const models = await service.getModels();

		assert.equal(models.length, 1);
		assert.equal(models[0]?.id, 'picker-id');
		assert.equal(models[0]?.apiModelId, 'api-id');
		assert.equal(models[0]?.name, 'Picker Name');
		assert.equal(models[0]?.toolCalling, 42);
		assert.equal(models[0]?.thinking, true);
		assert.equal(await service.getModels(), models);
		assert.equal((await service.resolveModel('picker-id'))?.apiModelId, 'api-id');
		assert.equal(await service.resolveModel('missing'), undefined);
	});

	it('loads auto models, applies metadata, and honors enabled model IDs', async () => {
		await updateApertureConfig({
			baseUrl: 'https://aperture.example.com/root',
			modelMetadataUrl: 'https://metadata.example.com/models.json',
			enabledModelIds: ['deepseek-v4-flash'],
			models: [{ id: 'deepseek-v4-flash', maxInputTokens: 1_048_576 }],
			toolLimit: 64,
		});

		const calls: Array<{ url: string; headers?: HeadersInit }> = [];
		globalThis.fetch = (async (url, init) => {
			calls.push({ url: String(url), headers: init?.headers });
			if (String(url) === 'https://aperture.example.com/root/v1/models') {
				return jsonResponse({
					data: [
						{
							id: 'deepseek-v4-flash',
							metadata: { provider: { name: 'DeepSeek' } },
						},
						{
							id: 'ignored-model',
						},
					],
				});
			}
			if (String(url) === 'https://metadata.example.com/models.json') {
				return jsonResponse({
					'deepseek/deepseek-v4-flash': {
						id: 'deepseek/deepseek-v4-flash',
						reasoning: true,
						tool_call: false,
						limit: {
							context: 1_000_000,
							output: 384_000,
						},
					},
				});
			}
			return new Response('unexpected', { status: 404 });
		}) as typeof fetch;

		const service = new ModelService('agent/1');
		const models = await service.getModels();

		assert.deepEqual(
			calls.map((call) => call.url),
			[
				'https://aperture.example.com/root/v1/models',
				'https://metadata.example.com/models.json',
			],
		);
		assert.deepEqual(calls[0]?.headers, { 'User-Agent': 'agent/1' });
		assert.equal(models.length, 1);
		assert.equal(models[0]?.id, 'deepseek-v4-flash');
		assert.equal(models[0]?.maxInputTokens, 1_048_576);
		assert.equal(models[0]?.maxOutputTokens, 384_000);
		assert.equal(models[0]?.thinking, true);
		assert.equal(models[0]?.toolCalling, false);
	});

	it('returns no auto models when base URL is missing or the request fails', async () => {
		await updateApertureConfig({
		});
		let fetchCount = 0;
		globalThis.fetch = (async () => {
			fetchCount += 1;
			return jsonResponse({ data: [{ id: 'should-not-load' }] });
		}) as typeof fetch;

		const service = new ModelService('agent/1');

		assert.deepEqual(await service.getModels(), []);
		assert.equal(fetchCount, 0);

		await updateApertureConfig({
			baseUrl: 'https://aperture.example.com',
		});
		service.clear();
		globalThis.fetch = (async () =>
			new Response('broken', { status: 503 })) as typeof fetch;

		assert.deepEqual(await service.getModels(), []);
	});

	it('keeps configured models when auto discovery fails', async () => {
		await updateApertureConfig({
			baseUrl: 'https://aperture.example.com',
			models: [{ id: 'fallback', maxInputTokens: 256_000 }],
		});
		globalThis.fetch = (async () =>
			new Response('broken', { status: 503 })) as typeof fetch;

		const models = await new ModelService('agent/1').getModels();

		assert.equal(models.length, 1);
		assert.equal(models[0]?.id, 'fallback');
		assert.equal(models[0]?.maxInputTokens, 256_000);
	});
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		headers: { 'Content-Type': 'application/json' },
		status: 200,
	});
}
