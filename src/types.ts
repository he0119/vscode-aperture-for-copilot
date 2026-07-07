export type ModelSource = 'auto' | 'manual';
export type DebugMode = 'minimal' | 'metadata' | 'verbose';
export type ThinkingEffort = 'none' | 'high' | 'max';

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

export interface ApertureProviderModel {
	id?: unknown;
	object?: unknown;
	owned_by?: unknown;
	metadata?: {
		provider?: {
			id?: unknown;
			name?: unknown;
			description?: unknown;
		};
	};
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

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	tool_call_id?: string;
	tool_calls?: ToolCall[];
	reasoning_content?: string;
}

export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatTool {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	};
}

export interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	stream: boolean;
	tools?: ChatTool[];
	tool_choice?: 'none' | 'auto' | 'required';
	max_tokens?: number;
	thinking?: { type: 'enabled' | 'disabled' };
	reasoning_effort?: 'high' | 'max';
	stream_options?: {
		include_usage: boolean;
	};
}

export interface Usage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_cache_hit_tokens?: number;
	prompt_cache_miss_tokens?: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
	};
}

export interface StreamCallbacks {
	onContent: (content: string) => void;
	onReasoning: (content: string) => void;
	onToolCall: (toolCall: ToolCall) => void;
	onUsage: (usage: Usage) => void;
	onDone: () => void;
	onError: (error: Error) => void;
}
