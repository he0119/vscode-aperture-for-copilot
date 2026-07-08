import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { convertMessages, convertTools } from '../../src/api/openaiConvert';

class LanguageModelThinkingPart {
	constructor(readonly value: string | string[]) {}
}

describe('openaiConvert', () => {
	it('convertMessages maps VS Code chat parts to OpenAI-compatible messages', () => {
	const messages = [
		{
			role: 3 as vscode.LanguageModelChatMessageRole,
			content: [new vscode.LanguageModelTextPart('system prompt')],
		},
		{
			role: vscode.LanguageModelChatMessageRole.User,
			content: [new vscode.LanguageModelTextPart('hello')],
		},
		{
			role: vscode.LanguageModelChatMessageRole.Assistant,
			content: [
				new LanguageModelThinkingPart(['think ', 'carefully']),
				new vscode.LanguageModelTextPart('answer'),
				new vscode.LanguageModelToolCallPart('call_1', 'lookup', { query: 'aperture' }),
			],
		},
		{
			role: vscode.LanguageModelChatMessageRole.User,
			content: [
				new vscode.LanguageModelToolResultPart('call_1', [
					new vscode.LanguageModelTextPart('tool result'),
				]),
			],
		},
	] as unknown as Parameters<typeof convertMessages>[0];

	assert.deepEqual(convertMessages(messages, true), [
		{ role: 'system', content: 'system prompt' },
		{ role: 'user', content: 'hello' },
		{
			role: 'assistant',
			content: 'answer',
			tool_calls: [
				{
					id: 'call_1',
					type: 'function',
					function: {
						name: 'lookup',
						arguments: '{"query":"aperture"}',
					},
				},
			],
			reasoning_content: 'think carefully',
		},
		{
			role: 'tool',
			content: 'tool result',
			tool_call_id: 'call_1',
		},
	]);
});

	it('convertMessages drops assistant reasoning when thinking is disabled', () => {
	const messages = [
		{
			role: vscode.LanguageModelChatMessageRole.Assistant,
			content: [
				new LanguageModelThinkingPart('private reasoning'),
				new vscode.LanguageModelTextPart('visible answer'),
			],
		},
	] as unknown as Parameters<typeof convertMessages>[0];

	assert.deepEqual(convertMessages(messages, false), [
		{
			role: 'assistant',
			content: 'visible answer',
		},
	]);
});

	it('convertTools maps VS Code tool definitions to OpenAI-compatible tools', () => {
	const tools = [
		{
			name: 'lookup',
			description: 'Find a record',
			inputSchema: {
				type: 'object',
				properties: {
					query: { type: 'string' },
				},
				required: ['query'],
			},
		},
	] as unknown as Parameters<typeof convertTools>[0];

	assert.deepEqual(convertTools(tools), [
		{
			type: 'function',
			function: {
				name: 'lookup',
				description: 'Find a record',
				parameters: {
					type: 'object',
					properties: {
						query: { type: 'string' },
					},
					required: ['query'],
				},
			},
		},
	]);
	assert.equal(convertTools(undefined), undefined);
	assert.equal(convertTools([]), undefined);
});
});
