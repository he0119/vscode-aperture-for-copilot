import type { ManualModelConfig } from '../config/types';

export type { ManualModelConfig };

export interface ApertureModel {
	id: string;
	apiModelId: string;
	name: string;
	detail: string;
	family: string;
	version: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	toolCalling: boolean | number;
	thinking: boolean;
}

export interface ModelTokenLimits {
	maxInputTokens?: number;
	maxOutputTokens?: number;
}

export interface ModelCapabilityMetadata {
	thinking?: boolean;
	toolCalling?: boolean;
}

export type ModelMetadata = ModelTokenLimits & ModelCapabilityMetadata;

export type ModelMetadataLookup = (model: ApertureProviderModel & { id: string }) => ModelMetadata | undefined;

export interface ApertureProviderModel {
	id?: unknown;
	object?: unknown;
	owned_by?: unknown;
	reasoning?: unknown;
	reasoning_options?: unknown;
	interleaved?: unknown;
	thinking?: unknown;
	tool_call?: unknown;
	toolCalling?: unknown;
	capabilities?: {
		thinking?: unknown;
		tool_call?: unknown;
		toolCalling?: unknown;
	};
	metadata?: {
		capabilities?: {
			thinking?: unknown;
			tool_call?: unknown;
			toolCalling?: unknown;
		};
		context_length?: unknown;
		context_window?: unknown;
		interleaved?: unknown;
		input_token_limit?: unknown;
		limit?: {
			context?: unknown;
			input?: unknown;
			output?: unknown;
		};
		limits?: {
			context?: unknown;
			input?: unknown;
			output?: unknown;
		};
		max_context_length?: unknown;
		max_context_tokens?: unknown;
		max_input_tokens?: unknown;
		max_output_tokens?: unknown;
		maxOutputTokens?: unknown;
		maxInputTokens?: unknown;
		output_token_limit?: unknown;
		reasoning?: unknown;
		reasoning_options?: unknown;
		thinking?: unknown;
		tool_call?: unknown;
		toolCalling?: unknown;
		provider?: {
			id?: unknown;
			name?: unknown;
			description?: unknown;
		};
	};
	context_length?: unknown;
	context_window?: unknown;
	input_token_limit?: unknown;
	limit?: {
		context?: unknown;
		input?: unknown;
		output?: unknown;
	};
	limits?: {
		context?: unknown;
		input?: unknown;
		output?: unknown;
	};
	max_context_length?: unknown;
	max_context_tokens?: unknown;
	max_input_tokens?: unknown;
	max_output_tokens?: unknown;
	maxOutputTokens?: unknown;
	maxInputTokens?: unknown;
	output_token_limit?: unknown;
	pricing?: {
		input?: unknown;
		input_cache_read?: unknown;
		output?: unknown;
	};
}

export interface ModelsResponse {
	object?: unknown;
	data?: unknown;
}
