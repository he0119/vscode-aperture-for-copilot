import assert from 'node:assert/strict';
import {
	buildAutoModels,
	buildConfiguredModels,
	mergeConfiguredModels,
} from '../../src/models/registry';

describe('modelRegistry', () => {
	it('buildAutoModels deduplicates model IDs and keeps the first provider', () => {
	const models = buildAutoModels(
		{
			data: [
				{
					id: 'deepseek-v4-flash',
					metadata: { provider: { name: 'DeepSeek' } },
					pricing: { input: '0.1', output: '0.2' },
				},
				{
					id: 'deepseek-v4-flash',
					metadata: { provider: { name: 'DeepSeek mirror' } },
				},
				{
					id: 'gemini-2.5-pro',
					metadata: { provider: { name: 'Google AI Studio' } },
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
	assert.match(models[0]?.detail ?? '', /DeepSeek/u);
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

	it('buildConfiguredModels maps apiModelId and defaults display fields', () => {
	const models = buildConfiguredModels(
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

	it('mergeConfiguredModels overrides matching IDs and appends missing models', () => {
		const discovered = buildAutoModels(
			{ data: [{ id: 'k3' }, { id: 'unchanged' }] },
			{ enabledModelIds: [], toolLimit: 128 },
		);

		const models = mergeConfiguredModels(
			discovered,
			[
				{
					id: 'k3',
					apiModelId: 'moonshotai/kimi-k3',
					name: 'Kimi K3',
					maxInputTokens: 1_048_576,
					maxOutputTokens: 131_072,
					thinking: true,
				},
				{ id: 'configured-only', toolCalling: false },
			],
			64,
		);

		assert.deepEqual(
			models.map((model) => model.id),
			['k3', 'unchanged', 'configured-only'],
		);
		assert.equal(models[0]?.name, 'Kimi K3');
		assert.equal(models[0]?.apiModelId, 'moonshotai/kimi-k3');
		assert.equal(models[0]?.version, 'moonshotai/kimi-k3');
		assert.equal(models[0]?.maxInputTokens, 1_048_576);
		assert.equal(models[0]?.maxOutputTokens, 131_072);
		assert.equal(models[0]?.thinking, true);
		assert.equal(models[0]?.toolCalling, 128);
		assert.equal(models[1]?.maxInputTokens, 128_000);
		assert.equal(models[2]?.toolCalling, false);
	});
});
