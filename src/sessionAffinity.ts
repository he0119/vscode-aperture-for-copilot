import { createHash, randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { convertMessages } from './openaiConvert';
import type { ChatMessage, ToolCall } from './types';

// VS Code does not currently expose an official Copilot Chat conversation id
// through LanguageModelChatProvider. These keys are best-effort compatibility
// hooks for runtimes that may pass a stable id through private or future fields.
// TODO: Replace the fallback transcript matching with options.chatSessionResource
// once VS Code exposes it to LanguageModelChatProvider.
// See https://github.com/microsoft/vscode/issues/305853.
const SESSION_OPTION_KEYS = ['sessionId', 'chatSessionId', 'conversationId'] as const;

// Keep the fallback state bounded. Each entry is only a hashed transcript
// fingerprint, not raw prompt text, but the map should still avoid unbounded
// growth during long editor sessions.
const MAX_TRACKED_TRANSCRIPTS = 200;

type SessionAffinityOptions = vscode.ProvideLanguageModelChatResponseOptions & {
	readonly sessionId?: unknown;
	readonly chatSessionId?: unknown;
	readonly conversationId?: unknown;
	readonly modelConfiguration?: Record<string, unknown>;
	readonly configuration?: Record<string, unknown>;
};

export interface AssistantAffinityResponse {
	readonly content: string;
	readonly reasoning: string;
	readonly toolCalls: readonly ToolCall[];
}

export interface SessionAffinityAssignment {
	readonly value: string;
	recordAssistantResponse(response: AssistantAffinityResponse): void;
}

/**
 * Assigns a stable X-Session-Affinity value for a chat turn.
 *
 * The preferred path is a runtime-provided session id. When VS Code does not
 * provide one, the manager creates a random affinity for each new conversation
 * and later reuses it by matching the transcript history that VS Code sends
 * back on follow-up turns.
 */
export class SessionAffinityManager {
	private readonly transcriptAffinities = new Map<string, string>();

	begin(
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
	): SessionAffinityAssignment {
		// If a real session-like id is available, derive the header only from it.
		// No in-memory tracking is needed because the same runtime id will be
		// present on every turn in that conversation.
		const runtimeSession = getRuntimeSession(options);
		if (runtimeSession) {
			return {
				value: hashSessionAffinity(runtimeSession),
				recordAssistantResponse: () => undefined,
			};
		}

		// Convert to the same OpenAI-compatible shape used by the request body so
		// the fallback matching follows the actual transcript sent upstream.
		const requestMessages = convertMessages(messages, true);

		// A root request with only the user's first message must be treated as a
		// new conversation every time. Storing that root fingerprint would make
		// two separate chats that start with the same prompt reuse one affinity.
		const value = this.findAffinity(requestMessages) ?? createRandomAffinity();
		if (hasConversationHistory(requestMessages)) {
			this.remember(requestMessages, value);
		}

		return {
			value,
			recordAssistantResponse: (response) => {
				// Follow-up requests include the previous assistant answer in their
				// message history. Recording it after the stream completes lets the
				// next turn reconnect to this random affinity without needing an
				// official Copilot Chat session id.
				const assistant = createAssistantMessage(response);
				if (!assistant) {
					return;
				}
				this.remember([...requestMessages, assistant], value);
			},
		};
	}

	private findAffinity(messages: readonly ChatMessage[]): string | undefined {
		// Only histories containing an assistant/tool turn can be matched. Plain
		// first-user-message requests are always considered new conversations.
		if (!hasConversationHistory(messages)) {
			return undefined;
		}

		// Prefer the longest matching transcript prefix. This handles normal
		// follow-up turns while still tolerating VS Code adding a new trailing user
		// message after the previously recorded assistant response.
		for (let length = messages.length; length >= 1; length -= 1) {
			const affinity = this.transcriptAffinities.get(
				fingerprintMessages(messages.slice(0, length)),
			);
			if (affinity) {
				return affinity;
			}
		}
		return undefined;
	}

	private remember(messages: readonly ChatMessage[], affinity: string): void {
		if (messages.length === 0) {
			return;
		}

		const fingerprint = fingerprintMessages(messages);

		// Delete then set refreshes insertion order, making the map a small LRU.
		this.transcriptAffinities.delete(fingerprint);
		this.transcriptAffinities.set(fingerprint, affinity);

		while (this.transcriptAffinities.size > MAX_TRACKED_TRANSCRIPTS) {
			const oldest = this.transcriptAffinities.keys().next().value;
			if (!oldest) {
				break;
			}
			this.transcriptAffinities.delete(oldest);
		}
	}
}

function getRuntimeSession(
	options: vscode.ProvideLanguageModelChatResponseOptions,
): string | undefined {
	const typedOptions = options as SessionAffinityOptions;

	// Check the top-level object and the known option bags. The current public
	// VS Code API does not define these fields, so every value is validated at
	// runtime before it is trusted.
	for (const source of [
		typedOptions,
		typedOptions.modelOptions,
		typedOptions.modelConfiguration,
		typedOptions.configuration,
	]) {
		if (!isRecord(source)) {
			continue;
		}
		for (const key of SESSION_OPTION_KEYS) {
			const value = normalizeSessionValue(source[key]);
			if (value) {
				return `runtime:${key}:${value}`;
			}
		}
	}
	return undefined;
}

function createAssistantMessage(response: AssistantAffinityResponse): ChatMessage | undefined {
	// Empty streamed responses cannot help identify a future turn, so skip them.
	if (!response.content && response.toolCalls.length === 0) {
		return undefined;
	}

	return {
		role: 'assistant',
		content: response.content,
		...(response.reasoning ? { reasoning_content: response.reasoning } : {}),
		...(response.toolCalls.length > 0 ? { tool_calls: [...response.toolCalls] } : {}),
	};
}

function fingerprintMessages(messages: readonly ChatMessage[]): string {
	// Store only a hash of the transcript. This avoids keeping prompt text in
	// the affinity cache while still giving deterministic lookup keys.
	return hashSessionAffinity(JSON.stringify(messages));
}

function hasConversationHistory(messages: readonly ChatMessage[]): boolean {
	return messages.some((message) => message.role === 'assistant' || message.role === 'tool');
}

function createRandomAffinity(): string {
	return randomBytes(24).toString('base64url');
}

function hashSessionAffinity(value: string): string {
	return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}

function normalizeSessionValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
