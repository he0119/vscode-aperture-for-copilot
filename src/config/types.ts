export type DebugMode = 'minimal' | 'metadata' | 'verbose';

export interface ModelConfig {
	id: string;
	apiModelId?: string;
	name?: string;
	detail?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	toolCalling?: boolean | number;
	thinking?: boolean;
}
