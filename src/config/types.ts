export type ModelSource = 'auto' | 'manual';
export type DebugMode = 'minimal' | 'metadata' | 'verbose';

export interface ManualModelConfig {
	id: string;
	apiModelId?: string;
	name?: string;
	detail?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	toolCalling?: boolean | number;
	thinking?: boolean;
}
