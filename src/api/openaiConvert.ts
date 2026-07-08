import * as vscode from 'vscode';
import type { ChatMessage, ChatTool, ToolCall } from '../shared/types';

export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	includeReasoning: boolean,
): ChatMessage[] {
	const result: ChatMessage[] = [];

	for (const message of messages) {
		const role = mapRole(message.role);
		let content = '';
		let reasoning = '';
		const toolCalls: ToolCall[] = [];
		const toolResults: Array<{ callId: string; content: string }> = [];

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				content += part.value;
				continue;
			}

			if (isThinkingPart(part)) {
				reasoning += normalizeThinkingValue(part.value);
				continue;
			}

			if (part instanceof vscode.LanguageModelToolCallPart) {
				toolCalls.push({
					id: part.callId,
					type: 'function',
					function: {
						name: part.name,
						arguments: safeJson(part.input),
					},
				});
				continue;
			}

			if (part instanceof vscode.LanguageModelToolResultPart) {
				toolResults.push({
					callId: part.callId,
					content: collectToolResultText(part),
				});
			}
		}

		if (role === 'assistant') {
			if (content || toolCalls.length > 0) {
				const assistant: ChatMessage = { role: 'assistant', content };
				if (toolCalls.length > 0) {
					assistant.tool_calls = toolCalls;
				}
				if (includeReasoning && reasoning) {
					assistant.reasoning_content = reasoning;
				}
				result.push(assistant);
			}
		} else if (content) {
			result.push({ role, content });
		}

		for (const toolResult of toolResults) {
			result.push({
				role: 'tool',
				content: toolResult.content,
				tool_call_id: toolResult.callId,
			});
		}
	}

	return result;
}

export function convertTools(
	tools: readonly vscode.LanguageModelChatTool[] | undefined,
): ChatTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema as Record<string, unknown> | undefined,
		},
	}));
}

function mapRole(role: vscode.LanguageModelChatMessageRole): 'user' | 'assistant' | 'system' {
	if (role === vscode.LanguageModelChatMessageRole.Assistant) {
		return 'assistant';
	}

	const systemRole = 3;
	if ((role as number) === systemRole) {
		return 'system';
	}

	return 'user';
}

function collectToolResultText(part: vscode.LanguageModelToolResultPart): string {
	let content = '';
	for (const item of part.content) {
		if (item instanceof vscode.LanguageModelTextPart) {
			content += item.value;
		}
	}
	return content || safeJson(part.content);
}

function isThinkingPart(part: unknown): part is { value: string | string[] } {
	return (
		typeof part === 'object' &&
		part !== null &&
		'value' in part &&
		typeof (part as { constructor?: { name?: string } }).constructor?.name === 'string' &&
		(part as { constructor: { name: string } }).constructor.name.includes('Thinking')
	);
}

function normalizeThinkingValue(value: string | string[]): string {
	return Array.isArray(value) ? value.join('') : value;
}

function safeJson(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
