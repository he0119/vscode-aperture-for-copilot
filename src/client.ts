import * as vscode from 'vscode';
import { buildEndpointUrl } from './configCore';
import { logger } from './logger';
import { OpenAIStreamParser, type StreamEvent } from './streamParser';
import type { ChatCompletionRequest, StreamCallbacks } from './types';

export class ApertureClient {
	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string | undefined,
	) {}

	async streamChatCompletion(
		request: ChatCompletionRequest,
		callbacks: StreamCallbacks,
		token: vscode.CancellationToken,
	): Promise<void> {
		const controller = new AbortController();
		const cancellation = token.onCancellationRequested(() => controller.abort());

		try {
			if (token.isCancellationRequested) {
				controller.abort();
			}

			const requestBody: ChatCompletionRequest = {
				...request,
				stream_options: { include_usage: true },
			};
			logger.verbose('Aperture request', {
				model: requestBody.model,
				messageCount: requestBody.messages.length,
				toolCount: requestBody.tools?.length ?? 0,
				thinking: requestBody.thinking,
			});

			const response = await fetch(buildEndpointUrl(this.baseUrl, '/chat/completions'), {
				method: 'POST',
				headers: this.buildHeaders(),
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
			const parser = new OpenAIStreamParser();

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
		};
		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`;
		}
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
