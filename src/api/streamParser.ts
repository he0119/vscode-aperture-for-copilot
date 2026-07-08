import type { ToolCall, Usage } from '../shared/types';

export type StreamEvent =
	| { type: 'content'; value: string }
	| { type: 'reasoning'; value: string }
	| { type: 'toolCall'; value: ToolCall }
	| { type: 'usage'; value: Usage }
	| { type: 'done' };

export class OpenAIStreamParser {
	private buffer = '';
	private readonly pendingToolCalls = new Map<number, ToolCall>();
	private done = false;

	push(chunk: string): StreamEvent[] {
		if (this.done) {
			return [];
		}

		this.buffer += chunk;
		const lines = this.buffer.split(/\r?\n/u);
		this.buffer = lines.pop() ?? '';

		const events: StreamEvent[] = [];
		for (const line of lines) {
			events.push(...this.parseLine(line));
		}
		return events;
	}

	finish(): StreamEvent[] {
		if (this.done) {
			return [];
		}

		const events: StreamEvent[] = [];
		if (this.buffer.trim()) {
			events.push(...this.parseLine(this.buffer));
		}
		events.push(...this.flushToolCalls());
		events.push({ type: 'done' });
		this.done = true;
		this.buffer = '';
		return events;
	}

	private parseLine(line: string): StreamEvent[] {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith(':')) {
			return [];
		}

		if (!trimmed.startsWith('data:')) {
			return [];
		}

		const data = trimmed.slice(5).trimStart();
		if (data === '[DONE]') {
			this.done = true;
			return [...this.flushToolCalls(), { type: 'done' }];
		}

		let chunk: StreamChunk;
		try {
			chunk = JSON.parse(data) as StreamChunk;
		} catch {
			return [];
		}

		const events: StreamEvent[] = [];
		if (isUsage(chunk.usage)) {
			events.push({ type: 'usage', value: chunk.usage });
		}

		const choice = chunk.choices?.[0];
		if (!choice) {
			return events;
		}

		const reasoning = choice.delta?.reasoning_content;
		if (typeof reasoning === 'string' && reasoning.length > 0) {
			events.push({ type: 'reasoning', value: reasoning });
		}

		const content = choice.delta?.content;
		if (typeof content === 'string' && content.length > 0) {
			events.push({ type: 'content', value: content });
		}

		for (const toolCall of choice.delta?.tool_calls ?? []) {
			this.mergeToolCall(toolCall);
		}

		if (choice.finish_reason) {
			events.push(...this.flushToolCalls());
		}

		return events;
	}

	private mergeToolCall(delta: StreamToolCallDelta): void {
		const index = typeof delta.index === 'number' ? delta.index : 0;
		let pending = this.pendingToolCalls.get(index);
		if (!pending) {
			pending = {
				id: typeof delta.id === 'string' ? delta.id : `call_${index}`,
				type: 'function',
				function: {
					name: '',
					arguments: '',
				},
			};
			this.pendingToolCalls.set(index, pending);
		}

		if (typeof delta.id === 'string' && delta.id) {
			pending.id = delta.id;
		}
		if (typeof delta.function?.name === 'string') {
			pending.function.name += delta.function.name;
		}
		if (typeof delta.function?.arguments === 'string') {
			pending.function.arguments += delta.function.arguments;
		}
	}

	private flushToolCalls(): StreamEvent[] {
		const events = [...this.pendingToolCalls.values()]
			.filter((toolCall) => toolCall.function.name)
			.map((toolCall) => ({ type: 'toolCall' as const, value: toolCall }));
		this.pendingToolCalls.clear();
		return events;
	}
}

interface StreamChunk {
	choices?: Array<{
		delta?: {
			content?: unknown;
			reasoning_content?: unknown;
			tool_calls?: StreamToolCallDelta[];
		};
		finish_reason?: unknown;
	}>;
	usage?: unknown;
}

interface StreamToolCallDelta {
	index?: number;
	id?: unknown;
	function?: {
		name?: unknown;
		arguments?: unknown;
	};
}

function isUsage(value: unknown): value is Usage {
	return typeof value === 'object' && value !== null;
}
