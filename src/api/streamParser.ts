import type { ToolCall, Usage } from './types';
import { normalizeProtocolUsage } from './protocol';

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

abstract class JsonEventStreamParser {
	private buffer = '';
	private done = false;
	push(chunk: string): StreamEvent[] {
		if (this.done) return [];
		this.buffer += chunk;
		const lines = this.buffer.split(/\r?\n/u);
		this.buffer = lines.pop() ?? '';
		return lines.flatMap((line) => this.parseLine(line));
	}
	finish(): StreamEvent[] {
		if (this.done) return [];
		const events = this.buffer.trim() ? this.parseLine(this.buffer) : [];
		this.done = true;
		return [...events, ...this.flush(), { type: 'done' }];
	}
	protected flush(): StreamEvent[] { return []; }
	protected markDone(): void { this.done = true; }
	protected abstract parseEvent(value: Record<string, unknown>): StreamEvent[];
	private parseLine(line: string): StreamEvent[] {
		const trimmed = line.trim();
		if (!trimmed.startsWith('data:')) return [];
		try {
			const value: unknown = JSON.parse(trimmed.slice(5).trim());
			return isRecord(value) ? this.parseEvent(value) : [];
		} catch { return []; }
	}
}

export class ResponsesStreamParser extends JsonEventStreamParser {
	private readonly calls = new Map<string, ToolCall>();
	private readonly itemCalls = new Map<string, string>();
	protected parseEvent(event: Record<string, unknown>): StreamEvent[] {
		const type = event.type;
		if (type === 'response.output_text.delta' && typeof event.delta === 'string') return [{ type: 'content', value: event.delta }];
		if ((type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta') && typeof event.delta === 'string') return [{ type: 'reasoning', value: event.delta }];
		if (type === 'response.output_item.added' && isRecord(event.item) && event.item.type === 'function_call') {
			const id = string(event.item.call_id) ?? string(event.item.id) ?? `call_${this.calls.size}`;
			this.calls.set(id, { id, type: 'function', function: { name: string(event.item.name) ?? '', arguments: string(event.item.arguments) ?? '' } });
			const itemId = string(event.item.id); if (itemId) this.itemCalls.set(itemId, id);
		}
		if (type === 'response.function_call_arguments.delta' && typeof event.delta === 'string') {
			const itemId = string(event.item_id);
			const id = string(event.call_id) ?? (itemId ? this.itemCalls.get(itemId) : undefined);
			const call = id ? this.calls.get(id) : undefined;
			if (call) call.function.arguments += event.delta;
		}
		if (type === 'response.completed' && isRecord(event.response)) {
			const usage = isRecord(event.response.usage) ? [{ type: 'usage' as const, value: normalizeProtocolUsage(event.response.usage) }] : [];
			this.markDone();
			return [...this.flush(), ...usage, { type: 'done' }];
		}
		return [];
	}
	protected flush(): StreamEvent[] { const result = [...this.calls.values()].map((value) => ({ type: 'toolCall' as const, value })); this.calls.clear(); this.itemCalls.clear(); return result; }
}

export class AnthropicStreamParser extends JsonEventStreamParser {
	private calls = new Map<number, ToolCall>();
	private inputTokens: number | undefined;
	protected parseEvent(event: Record<string, unknown>): StreamEvent[] {
		if (event.type === 'message_start' && isRecord(event.message) && isRecord(event.message.usage)) this.inputTokens = numberValue(event.message.usage.input_tokens);
		if (event.type === 'content_block_start' && isRecord(event.content_block) && event.content_block.type === 'tool_use') {
			const index = numberValue(event.index) ?? 0;
			this.calls.set(index, { id: string(event.content_block.id) ?? `call_${index}`, type: 'function', function: { name: string(event.content_block.name) ?? '', arguments: '' } });
		}
		if (event.type === 'content_block_delta' && isRecord(event.delta)) {
			if (event.delta.type === 'text_delta' && typeof event.delta.text === 'string') return [{ type: 'content', value: event.delta.text }];
			if (event.delta.type === 'thinking_delta' && typeof event.delta.thinking === 'string') return [{ type: 'reasoning', value: event.delta.thinking }];
			if (event.delta.type === 'input_json_delta' && typeof event.delta.partial_json === 'string') {
				const call = this.calls.get(numberValue(event.index) ?? 0); if (call) call.function.arguments += event.delta.partial_json;
			}
		}
		if (event.type === 'message_delta' && isRecord(event.usage)) return [{ type: 'usage', value: normalizeProtocolUsage({ ...event.usage, input_tokens: this.inputTokens }) }];
		if (event.type === 'message_stop') { this.markDone(); return [...this.flush(), { type: 'done' }]; }
		return [];
	}
	protected flush(): StreamEvent[] { const result = [...this.calls.values()].map((value) => ({ type: 'toolCall' as const, value })); this.calls.clear(); return result; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function string(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' ? value : undefined; }

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
