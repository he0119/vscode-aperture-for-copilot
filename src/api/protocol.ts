import type { ApiProtocol } from '../config/types';
import type { ChatCompletionRequest, ChatMessage, ChatTool, Usage } from './types';

export interface ProtocolRequest {
	path: `/${string}`;
	body: unknown;
	headers?: Record<string, string>;
}

export function buildProtocolRequest(request: ChatCompletionRequest, protocol: ApiProtocol): ProtocolRequest {
	if (protocol === 'responses') {
		return {
			path: '/responses',
			body: {
				model: request.model,
				input: toResponsesInput(request.messages),
				stream: true,
				tools: request.tools?.map(toResponsesTool),
				tool_choice: request.tools?.length ? 'auto' : undefined,
				max_output_tokens: request.max_tokens,
				reasoning: request.reasoning_effort ? { effort: request.reasoning_effort } : undefined,
			},
		};
	}
	if (protocol === 'anthropic-messages') {
		const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
		return {
			path: '/messages',
			headers: { 'anthropic-version': '2023-06-01' },
			body: {
				model: request.model,
				messages: toAnthropicMessages(request.messages),
				system: system || undefined,
				stream: true,
				max_tokens: request.max_tokens ?? 4096,
				tools: request.tools?.map(toAnthropicTool),
				tool_choice: request.tools?.length ? { type: 'auto' } : undefined,
				thinking: request.thinking?.type === 'enabled' ? { type: 'enabled', budget_tokens: 1024 } : undefined,
			},
		};
	}
	return { path: '/chat/completions', body: { ...request, stream_options: { include_usage: true } } };
}

function toResponsesInput(messages: ChatMessage[]): unknown[] {
	return messages.flatMap((message) => {
		if (message.role === 'tool') {
			return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }];
		}
		const result: unknown[] = [{ role: message.role, content: message.content }];
		for (const call of message.tool_calls ?? []) {
			result.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
		}
		return result;
	});
}

function toResponsesTool(tool: ChatTool): unknown {
	return { type: 'function', name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters };
}

function toAnthropicMessages(messages: ChatMessage[]): unknown[] {
	return messages.filter((message) => message.role !== 'system').map((message) => {
		if (message.role === 'tool') {
			return { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: message.content }] };
		}
		const content: unknown[] = message.content ? [{ type: 'text', text: message.content }] : [];
		for (const call of message.tool_calls ?? []) {
			content.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseObject(call.function.arguments) });
		}
		return { role: message.role, content };
	});
}

function toAnthropicTool(tool: ChatTool): unknown {
	return { name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters ?? { type: 'object' } };
}

function parseObject(value: string): Record<string, unknown> {
	try { const parsed: unknown = JSON.parse(value); return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

export function normalizeProtocolUsage(value: Record<string, unknown>): Usage {
	const input = number(value.input_tokens) ?? number(value.prompt_tokens);
	const output = number(value.output_tokens) ?? number(value.completion_tokens);
	return { prompt_tokens: input, completion_tokens: output, total_tokens: number(value.total_tokens) ?? ((input ?? 0) + (output ?? 0)) };
}

function number(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined; }
