import assert from 'node:assert/strict';
import { ModelMetadataService } from '../../src/models/metadataService';
import { resetApertureConfig, updateApertureConfig } from '../helpers/config';

const originalFetch = globalThis.fetch;

afterEach(async () => {
	globalThis.fetch = originalFetch;
	await resetApertureConfig();
});

describe('ModelMetadataService', () => {
	it('loads, caches, and reuses pending metadata lookups', async () => {
		await updateApertureConfig({
			modelMetadataUrl: 'https://metadata.example.com/models.json',
		});

		let fetchCount = 0;
		let capturedUrl = '';
		let capturedHeaders: HeadersInit | undefined;
		let resolveFetch: ((response: Response) => void) | undefined;
		globalThis.fetch = (async (url, init) => {
			fetchCount += 1;
			capturedUrl = String(url);
			capturedHeaders = init?.headers;
			return new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			});
		}) as typeof fetch;

		const service = new ModelMetadataService('agent/1');
		const first = service.getLookup();
		const second = service.getLookup();

		resolveFetch?.(
			jsonResponse({
				'deepseek/deepseek-v4-flash': {
					id: 'deepseek/deepseek-v4-flash',
					name: 'DeepSeek V4 Flash',
					reasoning: true,
					tool_call: false,
					limit: {
						context: 1_000_000,
						output: 384_000,
					},
				},
			}),
		);

		const [firstLookup, secondLookup] = await Promise.all([first, second]);
		assert.equal(fetchCount, 1);
		assert.equal(capturedUrl, 'https://metadata.example.com/models.json');
		assert.deepEqual(capturedHeaders, { 'User-Agent': 'agent/1' });
		assert.equal(firstLookup, secondLookup);
		assert.deepEqual(
			firstLookup?.({
				id: 'deepseek-v4-flash',
				metadata: { provider: { name: 'DeepSeek' } },
			}),
			{
				maxInputTokens: 1_000_000,
				maxOutputTokens: 384_000,
				thinking: true,
				toolCalling: false,
			},
		);

		assert.equal(await service.getLookup(), firstLookup);
		assert.equal(fetchCount, 1);

		service.clear();
		globalThis.fetch = (async () => jsonResponse({})) as typeof fetch;
		assert.equal(await service.getLookup(), undefined);
		assert.equal(fetchCount, 1);
	});

	it('returns undefined when metadata fetch fails', async () => {
		await updateApertureConfig({
			modelMetadataUrl: 'https://metadata.example.com/models.json',
		});
		globalThis.fetch = (async () =>
			new Response('nope', { status: 500 })) as typeof fetch;

		const service = new ModelMetadataService('agent/1');

		assert.equal(await service.getLookup(), undefined);
	});
});

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		headers: { 'Content-Type': 'application/json' },
		status: 200,
	});
}
