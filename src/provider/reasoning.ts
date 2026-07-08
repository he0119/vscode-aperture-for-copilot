import type { ApertureModel } from '../models/types';

type ThinkingEffort = 'none' | 'high' | 'max';

export type ThinkingSelection = ThinkingEffort | 'auto';

export interface ReasoningEffortOption {
	value: ThinkingSelection;
	label: string;
	description: string;
}

type ReasoningModelIdentity = Pick<ApertureModel, 'id' | 'apiModelId' | 'family' | 'name'> &
	Partial<Pick<ApertureModel, 'detail' | 'version'>>;

const TOGGLE_OPTIONS: readonly ReasoningEffortOption[] = [
	{
		value: 'auto',
		label: 'On',
		description: 'Enable thinking and let the provider choose the effort.',
	},
	{
		value: 'none',
		label: 'Off',
		description: 'Disable thinking parameters.',
	},
];

const DEEPSEEK_OPTIONS: readonly ReasoningEffortOption[] = [
	{
		value: 'auto',
		label: 'Auto',
		description: 'Enable thinking and let DeepSeek choose the effort.',
	},
	...TOGGLE_OPTIONS.slice(1),
	{
		value: 'high',
		label: 'High',
		description: 'Send reasoning_effort: high.',
	},
	{
		value: 'max',
		label: 'Max',
		description: 'Send reasoning_effort: max.',
	},
];

export function getReasoningEffortOptions(
	model: ReasoningModelIdentity,
): readonly ReasoningEffortOption[] {
	return supportsReasoningEffort(model) ? DEEPSEEK_OPTIONS : TOGGLE_OPTIONS;
}

export function supportsReasoningEffort(model: ReasoningModelIdentity): boolean {
	return modelIdentityText(model).some((value) => slugKey(value).includes('deepseek'));
}

export function normalizeThinkingSelection(value: unknown): ThinkingSelection {
	return value === 'auto' || value === 'none' || value === 'high' || value === 'max'
		? value
		: 'auto';
}

export function shouldSendReasoningEffort(
	model: ReasoningModelIdentity,
	selection: ThinkingSelection,
): selection is 'high' | 'max' {
	return supportsReasoningEffort(model) && (selection === 'high' || selection === 'max');
}

function modelIdentityText(model: ReasoningModelIdentity): string[] {
	return [model.id, model.apiModelId, model.family, model.name, model.detail, model.version].filter(
		(value): value is string => typeof value === 'string' && value.trim().length > 0,
	);
}

function slugKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/['"]/gu, '')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');
}
