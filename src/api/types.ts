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
