import type { ModelMetadata, ModelMetadataLookup } from '../types';
import { extractModelMetadata, providerHintsFromModel } from './extract';
import {
	asRecord,
	normalizeKey,
	slugKey,
	stringValue,
	suffixAfterSlash,
	uniqueStrings,
} from './utils';

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
				providerAliases: providerAliases(
					providerId,
					stringValue(provider.id),
					stringValue(provider.name),
				),
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
