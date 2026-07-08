import {
	DEFAULT_MAX_INPUT_TOKENS,
	DEFAULT_MAX_OUTPUT_TOKENS,
	DEFAULT_TOOL_LIMIT,
} from '../shared/constants';
import { resolveModelMetadata } from './metadata';
import type {
	ApertureModel,
	ApertureProviderModel,
	ModelMetadataLookup,
	ManualModelConfig,
	ModelsResponse,
} from './types';

export interface BuildAutoModelsOptions {
	enabledModelIds: readonly string[];
	metadataLookup?: ModelMetadataLookup;
	toolLimit: number;
}

type ProviderModelWithId = ApertureProviderModel & { id: string };

export function buildAutoModels(
	response: ModelsResponse,
	options: BuildAutoModelsOptions,
): ApertureModel[] {
	const data = Array.isArray(response.data) ? response.data : [];
	const enabled = new Set(options.enabledModelIds);
	const seen = new Set<string>();
	const models: ApertureModel[] = [];

	for (const item of data) {
		const model = toProviderModel(item);
		if (!model) {
			continue;
		}
		if (seen.has(model.id)) {
			continue;
		}
		if (enabled.size > 0 && !enabled.has(model.id)) {
			continue;
		}
		seen.add(model.id);
		const metadata = resolveModelMetadata(model, options.metadataLookup);
		models.push({
			id: model.id,
			apiModelId: model.id,
			name: model.id,
			detail: buildModelDetail(model),
			family: providerText(model) || 'aperture',
			version: model.id,
			maxInputTokens: metadata.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS,
			maxOutputTokens: metadata.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
			toolCalling: normalizeAutoToolCalling(metadata.toolCalling, options.toolLimit),
			thinking: metadata.thinking === true,
		});
	}

	return models;
}

export function buildManualModels(
	configs: readonly ManualModelConfig[],
	toolLimit: number = DEFAULT_TOOL_LIMIT,
): ApertureModel[] {
	const seen = new Set<string>();
	const models: ApertureModel[] = [];

	for (const config of configs) {
		const id = typeof config.id === 'string' ? config.id.trim() : '';
		if (!id || seen.has(id)) {
			continue;
		}
		seen.add(id);
		const apiModelId = config.apiModelId?.trim() || id;
		models.push({
			id,
			apiModelId,
			name: config.name?.trim() || id,
			detail: config.detail?.trim() || 'Aperture manual model',
			family: 'aperture',
			version: apiModelId,
			maxInputTokens: positiveInteger(config.maxInputTokens) ?? DEFAULT_MAX_INPUT_TOKENS,
			maxOutputTokens: positiveInteger(config.maxOutputTokens) ?? DEFAULT_MAX_OUTPUT_TOKENS,
			toolCalling: normalizeToolCalling(config.toolCalling, toolLimit),
			thinking: config.thinking === true,
		});
	}

	return models;
}

function toProviderModel(value: unknown): ProviderModelWithId | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const model = value as ApertureProviderModel;
	if (typeof model.id !== 'string' || model.id.trim().length === 0) {
		return undefined;
	}
	return { ...model, id: model.id.trim() };
}

function buildModelDetail(model: ApertureProviderModel): string {
	const parts = [providerText(model), pricingText(model)].filter(Boolean);
	return parts.join(' · ') || 'Aperture model';
}

function providerText(model: ApertureProviderModel): string | undefined {
	const provider = model.metadata?.provider?.name;
	return typeof provider === 'string' && provider.trim() ? provider.trim() : undefined;
}

function pricingText(model: ApertureProviderModel): string | undefined {
	const input = stringValue(model.pricing?.input);
	const output = stringValue(model.pricing?.output);
	if (!input && !output) {
		return undefined;
	}
	return `in ${input ?? '?'} / out ${output ?? '?'}`;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function normalizeToolCalling(value: unknown, toolLimit: number): boolean | number {
	if (value === false) {
		return false;
	}
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return value;
	}
	return value === true ? toolLimit : toolLimit;
}

function normalizeAutoToolCalling(value: boolean | undefined, toolLimit: number): boolean | number {
	return value === false ? false : toolLimit;
}
