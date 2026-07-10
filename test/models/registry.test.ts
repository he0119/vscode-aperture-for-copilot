import assert from 'node:assert/strict';
import { buildAutoModels, buildManualModels } from '../../src/models/registry';

describe('modelRegistry', () => {
	it('buildAutoModels deduplicates model IDs and aggregates routable providers', () => {
		const models = buildAutoModels(
			{
				data: [
					{
						id: 'deepseek-v4-flash',
						metadata: { provider: { id: 'deepseek', name: 'DeepSeek' } },
						pricing: { input: '0.1', output: '0.2' },
					},
					{
						id: 'deepseek-v4-flash',
						metadata: { provider: { id: 'mirror' } },
					},
					{
						id: 'deepseek-v4-flash',
						metadata: { provider: { id: 'mirror', name: 'Duplicate mirror' } },
					},
					{
						id: 'deepseek-v4-flash',
						metadata: { provider: { name: 'Missing ID' } },
					},
					{
						id: 'gemini-2.5-pro',
						metadata: { provider: { id: 'google', name: 'Google AI Studio' } },
					},
				],
			},
			{
				enabledModelIds: [],
				toolLimit: 128,
			},
		);

		assert.equal(models.length, 2);
		assert.equal(models[0]?.id, 'deepseek-v4-flash');
		assert.equal(models[0]?.detail, '2 providers available');
		assert.deepEqual(models[0]?.providers, [
			{ id: 'deepseek', name: 'DeepSeek' },
			{ id: 'mirror', name: 'mirror' },
		]);
		assert.deepEqual(models[1]?.providers, [{ id: 'google', name: 'Google AI Studio' }]);
		assert.equal(models[0]?.thinking, false);
		assert.equal(models[1]?.thinking, false);
	});

	it('buildAutoModels honors enabled model allow-list', () => {
	const models = buildAutoModels(
		{
			data: [{ id: 'a' }, { id: 'b' }],
		},
		{
			enabledModelIds: ['b'],
			toolLimit: 64,
		},
	);

	assert.deepEqual(
		models.map((model) => model.id),
		['b'],
	);
	assert.equal(models[0]?.toolCalling, 64);
});

	it('buildAutoModels uses provider limits before external metadata', () => {
	const models = buildAutoModels(
		{
			data: [
				{
					id: 'gpt-4o',
					limit: { context: 128_000, output: 16_384 },
				},
				{
					id: 'deepseek-ai/DeepSeek-V4-Flash',
					metadata: { provider: { name: 'DeepSeek' } },
				},
			],
		},
		{
			enabledModelIds: [],
			metadataLookup: (model) =>
				model.id.toLowerCase().includes('deepseek-v4-flash')
					? { maxInputTokens: 1_000_000, maxOutputTokens: 384_000 }
					: { maxInputTokens: 400_000, maxOutputTokens: 128_000 },
			toolLimit: 64,
		},
	);

	assert.equal(models[0]?.maxInputTokens, 128_000);
	assert.equal(models[0]?.maxOutputTokens, 16_384);
	assert.equal(models[1]?.maxInputTokens, 1_000_000);
	assert.equal(models[1]?.maxOutputTokens, 384_000);
});

	it('buildAutoModels uses external capability metadata', () => {
	const models = buildAutoModels(
		{
			data: [
				{
					id: 'deepseek-v4-flash',
				},
				{
					id: 'no-tools-model',
				},
			],
		},
		{
			enabledModelIds: [],
			metadataLookup: (model) =>
				model.id === 'deepseek-v4-flash'
					? { thinking: true, toolCalling: true }
					: { toolCalling: false },
			toolLimit: 64,
		},
	);

	assert.equal(models[0]?.thinking, true);
	assert.equal(models[0]?.toolCalling, 64);
	assert.equal(models[1]?.thinking, false);
	assert.equal(models[1]?.toolCalling, false);
});

	it('buildManualModels maps apiModelId and defaults display fields', () => {
	const models = buildManualModels(
		[
			{
				id: 'picker-id',
				apiModelId: 'api-id',
				toolCalling: false,
				thinking: true,
			},
		],
		128,
	);

	assert.equal(models.length, 1);
	assert.equal(models[0]?.id, 'picker-id');
	assert.equal(models[0]?.apiModelId, 'api-id');
	assert.equal(models[0]?.name, 'picker-id');
	assert.equal(models[0]?.toolCalling, false);
	assert.equal(models[0]?.thinking, true);
});
});
