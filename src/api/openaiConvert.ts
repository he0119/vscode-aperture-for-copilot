import * as vscode from 'vscode';
import {
	normalizeChatTranscript,
	type ChatTranscriptMessage,
	type ChatTranscriptToolCall,
} from '../chat/transcript';
import type { ChatMessage, ChatTool, ToolCall } from './types';

export function convertMessages(
	messages: readonly vscode.LanguageModelChatRequestMessage[],
	includeReasoning: boolean,
): ChatMessage[] {
	return normalizeChatTranscript(messages, { includeReasoning }).map(toChatMessage);
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

function toChatMessage(message: ChatTranscriptMessage): ChatMessage {
	const result: ChatMessage = {
		role: message.role,
		content: message.content,
	};
	if (message.toolCallId) {
		result.tool_call_id = message.toolCallId;
	}
	if (message.toolCalls && message.toolCalls.length > 0) {
		result.tool_calls = message.toolCalls.map(toToolCall);
	}
	if (message.reasoning) {
		result.reasoning_content = message.reasoning;
	}
	return result;
}

function toToolCall(toolCall: ChatTranscriptToolCall): ToolCall {
	return {
		id: toolCall.id,
		type: 'function',
		function: {
			name: toolCall.name,
			arguments: toolCall.argumentsJson,
		},
	};
}
