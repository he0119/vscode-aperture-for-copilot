import type {
	ModelCapabilityMetadata,
	ApertureProviderModel,
	ModelMetadata,
	ModelMetadataLookup,
	ModelTokenLimits,
} from './types';

type ProviderModelWithId = ApertureProviderModel & { id: string };

interface CatalogEntry {
	modelId: string;
	modelName?: string;
	providerAliases: readonly string[];
	providerId: string;
	providerName?: string;
	metadata: ModelMetadata;
}

interface ScoredEntry {
	entry: CatalogEntry;
	keyScore: number;
}

export class ModelMetadataIndex {
	private readonly byKey = new Map<string, ScoredEntry[]>();

	constructor(private readonly entries: readonly CatalogEntry[]) {
		for (const entry of entries) {
			for (const { key, score } of entryKeys(entry)) {
				const bucket = this.byKey.get(key) ?? [];
				bucket.push({ entry, keyScore: score });
				this.byKey.set(key, bucket);
			}
		}
	}

	get size(): number {
		return this.entries.length;
	}

	lookup(modelId: string, providerHints: readonly string[] = []): ModelMetadata | undefined {
		const candidates = new Map<CatalogEntry, number>();

		for (const { key, score } of lookupKeys(modelId)) {
			for (const scored of this.byKey.get(key) ?? []) {
				const current = candidates.get(scored.entry) ?? 0;
				candidates.set(scored.entry, Math.max(current, score + scored.keyScore));
			}
		}

		let best: { entry: CatalogEntry; score: number } | undefined;
		const hintAliases = providerHints.flatMap((hint) => providerAliases(hint));
		const modelProviderAliases = providerAliases(modelId.split('/')[0] ?? '');

		for (const [entry, baseScore] of candidates) {
			const providerScore =
				matchingAliasScore(entry.providerAliases, hintAliases) ||
				matchingAliasScore(entry.providerAliases, modelProviderAliases);
			const score = baseScore + providerScore;
			if (!best || score > best.score) {
				best = { entry, score };
			}
		}

		return best ? { ...best.entry.metadata } : undefined;
	}
}

export function buildModelsDevModelMetadataIndex(value: unknown): ModelMetadataIndex {
	return new ModelMetadataIndex(readModelsDevEntries(value));
}

export function buildModelsDevModelMetadataLookup(value: unknown): ModelMetadataLookup {
	const index = buildModelsDevModelMetadataIndex(value);
	return (model) => index.lookup(model.id, providerHintsFromModel(model));
}

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

function readProviderCatalogEntries(value: unknown): CatalogEntry[] {
	const root = asRecord(value);
	if (!root) {
		return [];
	}

	const entries: CatalogEntry[] = [];
	for (const [providerId, providerValue] of Object.entries(root)) {
		const provider = asRecord(providerValue);
		const models = asRecord(provider?.models);
		if (!provider || !models) {
			continue;
		}

		for (const [modelKey, modelValue] of Object.entries(models)) {
			const model = asRecord(modelValue);
			if (!model) {
				continue;
			}
			const metadata = extractModelMetadata(model);
			if (!metadata) {
				continue;
			}

			entries.push({
				modelId: stringValue(model.id) ?? modelKey,
				modelName: stringValue(model.name),
				providerAliases: providerAliases(providerId, stringValue(provider.id), stringValue(provider.name)),
				providerId,
				providerName: stringValue(provider.name),
				metadata,
			});
		}
	}

	return entries;
}

function readModelsDevEntries(value: unknown): CatalogEntry[] {
	const root = asRecord(value);
	if (!root) {
		return [];
	}

	const providers = asRecord(root.providers);
	const modelOnly = asRecord(root.models);
	if (providers || modelOnly) {
		return [
			...readProviderCatalogEntries(providers),
			...readModelOnlyCatalogEntries(modelOnly),
		];
	}

	const providerEntries = readProviderCatalogEntries(root);
	return providerEntries.length > 0 ? providerEntries : readModelOnlyCatalogEntries(root);
}

function readModelOnlyCatalogEntries(value: unknown): CatalogEntry[] {
	const models = asRecord(value);
	if (!models) {
		return [];
	}

	const entries: CatalogEntry[] = [];
	for (const [modelKey, modelValue] of Object.entries(models)) {
		const model = asRecord(modelValue);
		if (!model) {
			continue;
		}
		const metadata = extractModelMetadata(model);
		if (!metadata) {
			continue;
		}

		const modelId = stringValue(model.id) ?? modelKey;
		const providerId = modelId.includes('/') ? (modelId.split('/')[0] ?? '') : '';
		entries.push({
			modelId,
			modelName: stringValue(model.name),
			providerAliases: providerAliases(providerId),
			providerId,
			metadata,
		});
	}

	return entries;
}

function entryKeys(entry: CatalogEntry): Array<{ key: string; score: number }> {
	const values = [entry.modelId, suffixAfterSlash(entry.modelId), entry.modelName];
	return uniqueStrings(values)
		.flatMap((value) => [
			{ key: normalizeKey(value), score: 40 },
			{ key: slugKey(value), score: 30 },
		])
		.filter((item) => item.key.length > 0);
}

function lookupKeys(modelId: string): Array<{ key: string; score: number }> {
	const suffix = suffixAfterSlash(modelId);
	const values = [
		{ value: modelId, score: 70 },
		{ value: suffix, score: 80 },
	];
	return values
		.flatMap(({ value, score }) => [
			{ key: normalizeKey(value), score },
			{ key: slugKey(value), score: score - 10 },
		])
		.filter((item) => item.key.length > 0);
}

function providerAliases(...values: Array<string | undefined>): string[] {
	const aliases = new Set<string>();
	for (const value of values) {
		const slug = slugKey(value);
		if (!slug) {
			continue;
		}
		aliases.add(slug);
		aliases.add(slug.replace(/-?ai$/u, ''));
		aliases.add(slug.replace(/-?api$/u, ''));
		aliases.add(slug.replace(/-?cloud$/u, ''));
	}

	const normalized = new Set<string>();
	for (const alias of aliases) {
		if (!alias) {
			continue;
		}
		normalized.add(alias);
		switch (alias) {
			case 'google-ai-studio':
			case 'google-generative-ai':
				normalized.add('google');
				break;
			case 'deepseek-ai':
				normalized.add('deepseek');
				break;
			case 'x-ai':
				normalized.add('xai');
				break;
		}
	}
	return [...normalized];
}

function matchingAliasScore(left: readonly string[], right: readonly string[]): number {
	if (left.length === 0 || right.length === 0) {
		return 0;
	}
	const rightSet = new Set(right);
	return left.some((alias) => rightSet.has(alias)) ? 200 : 0;
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

function extractModelMetadata(value: unknown): ModelMetadata | undefined {
	const limits = extractModelTokenLimits(value);
	const capabilities = extractModelCapabilityMetadata(value);
	if (!limits && !capabilities) {
		return undefined;
	}
	return { ...limits, ...capabilities };
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

function booleanValue(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const match = value.trim().replace(/[, _]/gu, '').match(/^(\d+(?:\.\d+)?)([kKmM])?$/u);
	if (!match) {
		return undefined;
	}
	const amount = Number(match[1]);
	const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2] ? 1_000 : 1;
	const normalized = amount * multiplier;
	return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const trimmed = value?.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

function normalizeKey(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? '';
}

function slugKey(value: string | undefined): string {
	return (
		value
			?.trim()
			.toLowerCase()
			.replace(/['"]/gu, '')
			.replace(/[^a-z0-9]+/gu, '-')
			.replace(/^-+|-+$/gu, '') ?? ''
	);
}

function suffixAfterSlash(value: string): string {
	return value.includes('/') ? (value.split('/').pop() ?? value) : value;
}
