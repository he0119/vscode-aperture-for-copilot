export type DebugMode = 'minimal' | 'metadata' | 'verbose';
export type ApiProtocol = 'chat-completions' | 'responses' | 'anthropic-messages';

export interface ModelConfig {
	id: string;
	apiModelId?: string;
	apiProtocol?: ApiProtocol;
	name?: string;
	detail?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	toolCalling?: boolean | number;
	thinking?: boolean;
}
