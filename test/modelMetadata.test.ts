import assert from 'node:assert/strict';
import {
	buildModelsDevModelMetadataIndex,
	extractModelTokenLimits,
	resolveModelMetadata,
	resolveModelTokenLimits,
} from '../src/modelMetadata';

describe('modelMetadata', () => {
	it('extractModelTokenLimits reads input-specific limits before context limits', () => {
	const limits = extractModelTokenLimits({
		limit: {
			context: 400_000,
			input: 272_000,
			output: 128_000,
		},
	});

	assert.deepEqual(limits, {
		maxInputTokens: 272_000,
		maxOutputTokens: 128_000,
	});
});

	it('model metadata index matches provider-prefixed model IDs', () => {
	const index = buildModelsDevModelMetadataIndex({
		deepseek: {
			id: 'deepseek',
			name: 'DeepSeek',
			models: {
				'deepseek-v4-flash': {
					id: 'deepseek-v4-flash',
					name: 'DeepSeek V4 Flash',
					limit: {
						context: 1_000_000,
						output: 384_000,
					},
				},
			},
		},
	});

	assert.deepEqual(index.lookup('deepseek-ai/DeepSeek-V4-Flash', ['DeepSeek']), {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 384_000,
	});
});

	it('model metadata index prefers matching providers when IDs collide', () => {
	const index = buildModelsDevModelMetadataIndex({
		openai: {
			id: 'openai',
			name: 'OpenAI',
			models: {
				'gpt-4o': {
					id: 'gpt-4o',
					limit: { context: 128_000, output: 16_384 },
				},
			},
		},
		proxy: {
			id: 'proxy',
			name: 'Proxy',
			models: {
				'gpt-4o': {
					id: 'gpt-4o',
					limit: { context: 64_000, output: 8_192 },
				},
			},
		},
	});

	assert.deepEqual(index.lookup('gpt-4o', ['Proxy']), {
		maxInputTokens: 64_000,
		maxOutputTokens: 8_192,
	});
});

	it('buildModelsDevModelMetadataIndex reads models.dev models.json shape', () => {
	const index = buildModelsDevModelMetadataIndex({
		'deepseek/deepseek-v4-flash': {
			id: 'deepseek/deepseek-v4-flash',
			name: 'DeepSeek V4 Flash',
			family: 'deepseek-flash',
			reasoning: true,
			tool_call: false,
			limit: {
				context: 1_000_000,
				output: 384_000,
			},
		},
	});

	assert.deepEqual(index.lookup('deepseek-v4-flash', ['DeepSeek']), {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 384_000,
		thinking: true,
		toolCalling: false,
	});
});

	it('buildModelsDevModelMetadataIndex treats generic reasoning models as thinking-capable', () => {
	const index = buildModelsDevModelMetadataIndex({
		'meituan/longcat-2.0': {
			id: 'meituan/longcat-2.0',
			name: 'LongCat-2.0',
			family: 'longcat',
			reasoning: true,
			tool_call: true,
			limit: {
				context: 1_000_000,
				output: 131_072,
			},
		},
	});

	assert.deepEqual(index.lookup('LongCat-2.0', ['LongCat']), {
		maxInputTokens: 1_000_000,
		maxOutputTokens: 131_072,
		thinking: true,
		toolCalling: true,
	});
});

	it('buildModelsDevModelMetadataIndex reads models.dev catalog.json shape', () => {
	const index = buildModelsDevModelMetadataIndex({
		providers: {
			proxy: {
				id: 'proxy',
				name: 'Proxy',
				models: {
					'gpt-5': {
						id: 'gpt-5',
						limit: { context: 100_000, output: 16_000 },
					},
				},
			},
		},
		models: {
			'openai/gpt-5': {
				id: 'openai/gpt-5',
				limit: { context: 400_000, input: 272_000, output: 128_000 },
			},
		},
	});

	assert.deepEqual(index.lookup('gpt-5', ['Proxy']), {
		maxInputTokens: 100_000,
		maxOutputTokens: 16_000,
	});
	assert.deepEqual(index.lookup('gpt-5', ['OpenAI']), {
		maxInputTokens: 272_000,
		maxOutputTokens: 128_000,
	});
});

	it('resolveModelTokenLimits keeps provider fields ahead of catalog metadata', () => {
	const limits = resolveModelTokenLimits(
		{
			id: 'gpt-4o',
			context_length: 128_000,
			max_output_tokens: 16_384,
		},
		() => ({
			maxInputTokens: 1_000_000,
			maxOutputTokens: 32_768,
		}),
	);

	assert.deepEqual(limits, {
		maxInputTokens: 128_000,
		maxOutputTokens: 16_384,
	});
});

	it('resolveModelMetadata keeps provider capabilities ahead of catalog metadata', () => {
	const metadata = resolveModelMetadata(
		{
			id: 'gpt-4o',
			tool_call: false,
		},
		() => ({
			thinking: true,
			toolCalling: true,
		}),
	);

	assert.equal(metadata.thinking, true);
	assert.equal(metadata.toolCalling, false);
});
});
