import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutoModels, buildManualModels } from '../src/modelRegistry';

test('buildAutoModels deduplicates model IDs and keeps the first provider', () => {
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
			thinkingModelIds: ['deepseek-v4-flash'],
			toolLimit: 128,
		},
	);

	assert.equal(models.length, 2);
	assert.equal(models[0]?.id, 'deepseek-v4-flash');
	assert.match(models[0]?.detail ?? '', /DeepSeek/u);
	assert.equal(models[0]?.thinking, true);
	assert.equal(models[1]?.thinking, false);
});

test('buildAutoModels honors enabled model allow-list', () => {
	const models = buildAutoModels(
		{
			data: [{ id: 'a' }, { id: 'b' }],
		},
		{
			enabledModelIds: ['b'],
			thinkingModelIds: [],
			toolLimit: 64,
		},
	);

	assert.deepEqual(
		models.map((model) => model.id),
		['b'],
	);
	assert.equal(models[0]?.toolCalling, 64);
});

test('buildManualModels maps apiModelId and defaults display fields', () => {
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
