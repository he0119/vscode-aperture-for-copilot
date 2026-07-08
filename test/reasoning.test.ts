import assert from 'node:assert/strict';
import {
	getReasoningEffortOptions,
	normalizeThinkingSelection,
	shouldSendReasoningEffort,
	supportsReasoningEffort,
} from '../src/reasoning';

describe('reasoning', () => {
	it('getReasoningEffortOptions exposes effort levels for DeepSeek models', () => {
		const options = getReasoningEffortOptions({
			id: 'deepseek-v4-pro',
			apiModelId: 'deepseek-v4-pro',
			family: 'DeepSeek',
			name: 'DeepSeek V4 Pro',
		});

		assert.deepEqual(
			options.map((option) => option.value),
			['auto', 'none', 'high', 'max'],
		);
	});

	it('getReasoningEffortOptions exposes only on and off for generic reasoning models', () => {
		const options = getReasoningEffortOptions({
			id: 'LongCat-2.0',
			apiModelId: 'LongCat-2.0',
			family: 'longcat',
			name: 'LongCat-2.0',
		});

		assert.deepEqual(
			options.map((option) => option.value),
			['auto', 'none'],
		);
	});

	it('shouldSendReasoningEffort only allows DeepSeek effort values', () => {
		const deepseek = {
			id: 'provider/model-alias',
			apiModelId: 'deepseek-v4-pro',
			family: 'aperture',
			name: 'Alias',
		};
		const longcat = {
			id: 'LongCat-2.0',
			apiModelId: 'LongCat-2.0',
			family: 'longcat',
			name: 'LongCat-2.0',
		};

		assert.equal(supportsReasoningEffort(deepseek), true);
		assert.equal(shouldSendReasoningEffort(deepseek, 'high'), true);
		assert.equal(shouldSendReasoningEffort(deepseek, 'auto'), false);
		assert.equal(supportsReasoningEffort(longcat), false);
		assert.equal(shouldSendReasoningEffort(longcat, 'high'), false);
	});

	it('normalizeThinkingSelection falls back to auto for unknown values', () => {
		assert.equal(normalizeThinkingSelection('max'), 'max');
		assert.equal(normalizeThinkingSelection('enabled'), 'auto');
		assert.equal(normalizeThinkingSelection(undefined), 'auto');
	});
});
