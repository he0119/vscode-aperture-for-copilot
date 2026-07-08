import * as vscode from 'vscode';
import {
	CONFIG_SECTION,
	DEFAULT_MODELS_DEV_MODEL_METADATA_URL,
	DEFAULT_TOOL_LIMIT,
} from '../shared/constants';
import { normalizeBaseUrl } from './url';
import type { DebugMode, ManualModelConfig, ModelSource } from './types';

export function getConfiguredBaseUrl(): string | undefined {
	const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('baseUrl');
	return normalizeBaseUrl(value);
}

export async function updateConfiguredBaseUrl(value: string | undefined): Promise<void> {
	await vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.update('baseUrl', value ?? '', vscode.ConfigurationTarget.Global);
}

export function getModelSource(): ModelSource {
	const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('modelSource', 'auto');
	return value === 'manual' ? 'manual' : 'auto';
}

export function getModelMetadataUrl(): string {
	const value = vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<string>('modelMetadataUrl', '');
	try {
		const url = new URL(value.trim() || DEFAULT_MODELS_DEV_MODEL_METADATA_URL);
		url.hash = '';
		return url.toString();
	} catch {
		return DEFAULT_MODELS_DEV_MODEL_METADATA_URL;
	}
}

export function getEnabledModelIds(): string[] {
	return vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<string[]>('enabledModelIds', [])
		.filter((id) => id.trim().length > 0);
}

export function getManualModels(): ManualModelConfig[] {
	return vscode.workspace.getConfiguration(CONFIG_SECTION).get<ManualModelConfig[]>('models', []);
}

export function getMaxTokens(): number | undefined {
	const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>('maxTokens', 0);
	return value > 0 ? value : undefined;
}

export function getToolLimit(): number {
	const value = vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<number>('toolLimit', DEFAULT_TOOL_LIMIT);
	return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_TOOL_LIMIT;
}

export function getDebugMode(): DebugMode {
	const value = vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.get<string>('debugMode', 'minimal');
	if (value === 'metadata' || value === 'verbose') {
		return value;
	}
	return 'minimal';
}
