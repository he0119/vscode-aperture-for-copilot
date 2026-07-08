import * as vscode from 'vscode';

export type ChatTranscriptRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatTranscriptToolCall {
	id: string;
	name: string;
	argumentsJson: string;
}

export interface ChatTranscriptMessage {
	role: ChatTranscriptRole;
	content: string;
	toolCallId?: string;
	toolCalls?: ChatTranscriptToolCall[];
	reasoning?: string;
}

export interface NormalizeChatTranscriptOptions {
	includeReasoning: boolean;
}

export function normalizeChatTranscript(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	options: NormalizeChatTranscriptOptions,
): ChatTranscriptMessage[] {
	const result: ChatTranscriptMessage[] = [];

	for (const message of messages) {
		const role = mapRole(message.role);
		let content = '';
		let reasoning = '';
		const toolCalls: ChatTranscriptToolCall[] = [];
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
					name: part.name,
					argumentsJson: safeJson(part.input),
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
				result.push({
					role: 'assistant',
					content,
					...(toolCalls.length > 0 ? { toolCalls } : {}),
					...(options.includeReasoning && reasoning ? { reasoning } : {}),
				});
			}
		} else if (content) {
			result.push({ role, content });
		}

		for (const toolResult of toolResults) {
			result.push({
				role: 'tool',
				content: toolResult.content,
				toolCallId: toolResult.callId,
			});
		}
	}

	return result;
}

function mapRole(role: vscode.LanguageModelChatMessageRole): ChatTranscriptRole {
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
