import * as vscode from 'vscode';
import { buildEndpointUrl } from '../config/url';
import { logger } from '../runtime/logger';
import { OpenAIStreamParser, type StreamEvent } from './streamParser';
import type { ChatCompletionRequest, StreamCallbacks } from './types';
import type { ApiProtocol } from '../config/types';
import { buildProtocolRequest } from './protocol';
import { AnthropicStreamParser, ResponsesStreamParser } from './streamParser';

export class ApertureClient {
	constructor(
		private readonly baseUrl: string,
		private readonly userAgent: string,
		private readonly sessionAffinity: string,
	) {}

	async streamChatCompletion(
		request: ChatCompletionRequest,
		callbacks: StreamCallbacks,
		token: vscode.CancellationToken,
		protocol: ApiProtocol = 'chat-completions',
	): Promise<void> {
		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());

		try {
			if (token.isCancellationRequested) {
				controller.abort();
			}

			const protocolRequest = buildProtocolRequest(request, protocol);
			const requestBody = protocolRequest.body;
			logger.verbose('Aperture request', {
				model: request.model,
				messageCount: request.messages.length,
				toolCount: request.tools?.length ?? 0,
				protocol,
			});

			const response = await fetch(buildEndpointUrl(this.baseUrl, protocolRequest.path), {
				method: 'POST',
				headers: { ...this.buildHeaders(), ...protocolRequest.headers },
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw await buildHttpError(response);
			}
			if (!response.body) {
				throw new Error('Aperture response did not include a body.');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			const parser = protocol === 'responses' ? new ResponsesStreamParser() : protocol === 'anthropic-messages' ? new AnthropicStreamParser() : new OpenAIStreamParser();

			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) {
					for (const event of parser.finish()) {
						dispatch(event, callbacks);
					}
					return;
				}

				const chunk = decoder.decode(value, { stream: true });
				for (const event of parser.push(chunk)) {
					dispatch(event, callbacks);
				}
			}
		} catch (error) {
			if (isAbortError(error) && token.isCancellationRequested) {
				return;
			}
			const normalized = error instanceof Error ? error : new Error(String(error));
			callbacks.onError(normalized);
		} finally {
			cancellation.dispose();
		}
	}

	private buildHeaders(): HeadersInit {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'User-Agent': this.userAgent,
			'X-Session-Affinity': this.sessionAffinity,
		};
		return headers;
	}
}

function dispatch(event: StreamEvent, callbacks: StreamCallbacks): void {
	switch (event.type) {
		case 'content':
			callbacks.onContent(event.value);
			break;
		case 'reasoning':
			callbacks.onReasoning(event.value);
			break;
		case 'toolCall':
			callbacks.onToolCall(event.value);
			break;
		case 'usage':
			callbacks.onUsage(event.value);
			break;
		case 'done':
			callbacks.onDone();
			break;
	}
}

async function buildHttpError(response: Response): Promise<Error> {
	let body = '';
	try {
		body = await response.text();
	} catch {
		// Ignore body read failures; status is enough for a useful error.
	}
	return new Error(
		`Aperture request failed with HTTP ${response.status}${body ? `: ${body.slice(0, 1000)}` : ''}`,
	);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}
