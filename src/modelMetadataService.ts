import { DEFAULT_MODEL_METADATA_URL, MODEL_METADATA_FETCH_TIMEOUT_MS } from './constants';
import { getModelMetadataSource, getModelMetadataUrl } from './config';
import { logger } from './logger';
import {
	buildBaseLlmModelMetadataIndex,
	providerHintsFromModel,
} from './modelMetadata';
import type { ModelMetadataLookup } from './types';

export class ModelMetadataService {
	private cachedKey: string | undefined;
	private cachedLookup: ModelMetadataLookup | undefined;
	private pendingKey: string | undefined;
	private pendingLookup: Promise<ModelMetadataLookup | undefined> | undefined;

	constructor(private readonly userAgent: string) {}

	clear(): void {
		this.cachedKey = undefined;
		this.cachedLookup = undefined;
		this.pendingKey = undefined;
		this.pendingLookup = undefined;
	}

	async getLookup(): Promise<ModelMetadataLookup | undefined> {
		if (getModelMetadataSource() === 'off') {
			return undefined;
		}

		const url = getModelMetadataUrl();
		const key = `basellm:${url}`;
		if (this.cachedKey === key) {
			return this.cachedLookup;
		}
		if (this.pendingKey === key && this.pendingLookup) {
			return this.pendingLookup;
		}

		this.pendingKey = key;
		this.pendingLookup = this.loadBaseLlmLookup(url).finally(() => {
			this.pendingKey = undefined;
			this.pendingLookup = undefined;
		});
		const lookup = await this.pendingLookup;
		this.cachedKey = key;
		this.cachedLookup = lookup;
		return lookup;
	}

	private async loadBaseLlmLookup(url: string): Promise<ModelMetadataLookup | undefined> {
		try {
			const body = await fetchJson(url, this.userAgent);
			const index = buildBaseLlmModelMetadataIndex(body);
			if (index.size === 0) {
				logger.warn(`BaseLLM metadata did not contain usable model limits from ${url}`);
				return undefined;
			}
			logger.debug(`Loaded ${index.size} BaseLLM model metadata entries from ${url}`);
			return (model) => index.lookup(model.id, providerHintsFromModel(model));
		} catch (error) {
			logger.warn('Failed to load BaseLLM model metadata', error);
			if (url !== DEFAULT_MODEL_METADATA_URL) {
				logger.debug(`Configured BaseLLM metadata URL was ${url}`);
			}
			return undefined;
		}
	}
}

async function fetchJson(url: string, userAgent: string): Promise<unknown> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), MODEL_METADATA_FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': userAgent,
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Metadata request failed with HTTP ${response.status}`);
		}
		return await response.json();
	} finally {
		clearTimeout(timeout);
	}
}
