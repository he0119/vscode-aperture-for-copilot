import type {
	ApertureProviderModel,
	ModelCapabilityMetadata,
	ModelMetadata,
	ModelMetadataLookup,
	ModelTokenLimits,
} from '../types';
import { asRecord, booleanValue, positiveInteger, stringValue, uniqueStrings } from './utils';

export type ProviderModelWithId = ApertureProviderModel & { id: string };

export function resolveModelTokenLimits(
	model: ProviderModelWithId,
	metadataLookup?: ModelMetadataLookup,
): ModelTokenLimits {
	const metadata = resolveModelMetadata(model, metadataLookup);
	return {
		maxInputTokens: metadata.maxInputTokens,
		maxOutputTokens: metadata.maxOutputTokens,
	};
}

export function resolveModelMetadata(
	model: ProviderModelWithId,
	metadataLookup?: ModelMetadataLookup,
): ModelMetadata {
	const explicit = extractModelTokenLimits(model);
	const catalog = metadataLookup?.(model);
	const explicitCapabilities = extractModelCapabilityMetadata(model);
	return {
		maxInputTokens: explicit?.maxInputTokens ?? catalog?.maxInputTokens,
		maxOutputTokens: explicit?.maxOutputTokens ?? catalog?.maxOutputTokens,
		thinking: explicitCapabilities?.thinking ?? catalog?.thinking,
		toolCalling: explicitCapabilities?.toolCalling ?? catalog?.toolCalling,
	};
}

export function extractModelTokenLimits(value: unknown): ModelTokenLimits | undefined {
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}

	const metadata = asRecord(record.metadata);
	const limit = asRecord(record.limit);
	const limits = asRecord(record.limits);
	const metadataLimit = asRecord(metadata?.limit);
	const metadataLimits = asRecord(metadata?.limits);

	const maxInputTokens = firstPositiveInteger([
		record.maxInputTokens,
		record.max_input_tokens,
		record.input_token_limit,
		limit?.input,
		limits?.input,
		metadata?.maxInputTokens,
		metadata?.max_input_tokens,
		metadata?.input_token_limit,
		metadataLimit?.input,
		metadataLimits?.input,
		record.context_length,
		record.max_context_length,
		record.context_window,
		record.max_context_tokens,
		limit?.context,
		limits?.context,
		metadata?.context_length,
		metadata?.max_context_length,
		metadata?.context_window,
		metadata?.max_context_tokens,
		metadataLimit?.context,
		metadataLimits?.context,
	]);
	const maxOutputTokens = firstPositiveInteger([
		record.maxOutputTokens,
		record.max_output_tokens,
		record.output_token_limit,
		record.max_completion_tokens,
		limit?.output,
		limits?.output,
		metadata?.maxOutputTokens,
		metadata?.max_output_tokens,
		metadata?.output_token_limit,
		metadata?.max_completion_tokens,
		metadataLimit?.output,
		metadataLimits?.output,
	]);

	if (!maxInputTokens && !maxOutputTokens) {
		return undefined;
	}
	return { maxInputTokens, maxOutputTokens };
}

export function extractModelCapabilityMetadata(value: unknown): ModelCapabilityMetadata | undefined {
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}

	const metadata = asRecord(record.metadata);
	const capabilities = asRecord(record.capabilities);
	const metadataCapabilities = asRecord(metadata?.capabilities);
	const thinking = firstBoolean([
		record.thinking,
		capabilities?.thinking,
		metadata?.thinking,
		metadataCapabilities?.thinking,
		supportsReasoningThinking(record),
		supportsReasoningThinking(metadata),
	]);
	const toolCalling = firstBoolean([
		record.tool_call,
		record.toolCalling,
		capabilities?.tool_call,
		capabilities?.toolCalling,
		metadata?.tool_call,
		metadata?.toolCalling,
		metadataCapabilities?.tool_call,
		metadataCapabilities?.toolCalling,
	]);

	if (thinking === undefined && toolCalling === undefined) {
		return undefined;
	}
	return { thinking, toolCalling };
}

export function providerHintsFromModel(model: ProviderModelWithId): string[] {
	const metadata = asRecord(model.metadata);
	const provider = asRecord(metadata?.provider);
	const hints = [
		stringValue(provider?.id),
		stringValue(provider?.name),
		stringValue(model.owned_by),
		model.id.includes('/') ? model.id.split('/')[0] : undefined,
	];
	return uniqueStrings(hints);
}

export function extractModelMetadata(value: unknown): ModelMetadata | undefined {
	const limits = extractModelTokenLimits(value);
	const capabilities = extractModelCapabilityMetadata(value);
	if (!limits && !capabilities) {
		return undefined;
	}
	return { ...limits, ...capabilities };
}

function firstPositiveInteger(values: readonly unknown[]): number | undefined {
	for (const value of values) {
		const normalized = positiveInteger(value);
		if (normalized) {
			return normalized;
		}
	}
	return undefined;
}

function supportsReasoningThinking(value: unknown): boolean | undefined {
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}
	return booleanValue(record.reasoning) === true ? true : undefined;
}

function firstBoolean(values: readonly unknown[]): boolean | undefined {
	for (const value of values) {
		const normalized = booleanValue(value);
		if (normalized !== undefined) {
			return normalized;
		}
	}
	return undefined;
}
