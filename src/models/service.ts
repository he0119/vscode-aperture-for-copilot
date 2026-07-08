import { buildEndpointUrl } from '../config/url';
import {
	getConfiguredBaseUrl,
	getEnabledModelIds,
	getManualModels,
	getModelMetadataUrl,
	getModelSource,
	getToolLimit,
} from '../config/settings';
import { logger } from '../runtime/logger';
import { ModelMetadataService } from './metadataService';
import { buildAutoModels, buildManualModels } from './registry';
import type { ApertureModel, ModelsResponse } from './types';

export class ModelService {
	private cachedKey: string | undefined;
	private cachedModels: ApertureModel[] | undefined;
	private readonly metadata: ModelMetadataService;

	constructor(private readonly userAgent: string) {
		this.metadata = new ModelMetadataService(userAgent);
	}

	clear(): void {
		this.cachedKey = undefined;
		this.cachedModels = undefined;
		this.metadata.clear();
	}

	async getModels(): Promise<ApertureModel[]> {
		const key = JSON.stringify({
			baseUrl: getConfiguredBaseUrl(),
			source: getModelSource(),
			metadataUrl: getModelMetadataUrl(),
			enabled: getEnabledModelIds(),
			manual: getManualModels(),
			toolLimit: getToolLimit(),
		});

		if (this.cachedKey === key && this.cachedModels) {
			return this.cachedModels;
		}

		const models = await this.loadModels();
		this.cachedKey = key;
		this.cachedModels = models;
		return models;
	}

	async resolveModel(id: string): Promise<ApertureModel | undefined> {
		return (await this.getModels()).find((model) => model.id === id);
	}

	private async loadModels(): Promise<ApertureModel[]> {
		const toolLimit = getToolLimit();
		if (getModelSource() === 'manual') {
			return buildManualModels(getManualModels(), toolLimit);
		}

		const baseUrl = getConfiguredBaseUrl();
		if (!baseUrl) {
			logger.debug('Aperture base URL is not configured; no auto models available');
			return [];
		}

		try {
			const response = await fetch(buildEndpointUrl(baseUrl, '/models'), {
				headers: buildHeaders(this.userAgent),
			});
			if (!response.ok) {
				throw new Error(`Model list request failed with HTTP ${response.status}`);
			}
			const body = (await response.json()) as ModelsResponse;
			const metadataLookup = await this.metadata.getLookup();
			const models = buildAutoModels(body, {
				enabledModelIds: getEnabledModelIds(),
				metadataLookup,
				toolLimit,
			});
			logger.debug(`Loaded ${models.length} Aperture model(s) from ${baseUrl}`);
			return models;
		} catch (error) {
			logger.warn('Failed to load Aperture models', error);
			return [];
		}
	}
}

function buildHeaders(userAgent: string): HeadersInit {
	return {
		'User-Agent': userAgent,
	};
}
