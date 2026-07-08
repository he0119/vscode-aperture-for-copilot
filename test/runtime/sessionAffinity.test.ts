import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { SessionAffinityManager } from '../../src/runtime/sessionAffinity';

describe('SessionAffinityManager', () => {
	it('prefers runtime session IDs from provider options', () => {
		const manager = new SessionAffinityManager();
		const assignment = manager.begin(
			[vscode.LanguageModelChatMessage.User('hello')],
			{
				toolMode: vscode.LanguageModelChatToolMode.Auto,
				sessionId: ' chat-session-1 ',
			} as vscode.ProvideLanguageModelChatResponseOptions,
		);

		assert.equal(assignment.value, expectedAffinity('runtime:sessionId:chat-session-1'));
	});

	it('creates a fresh fallback affinity for each new conversation', () => {
		const manager = new SessionAffinityManager();
		const options = {
			toolMode: vscode.LanguageModelChatToolMode.Auto,
		} as vscode.ProvideLanguageModelChatResponseOptions;

		const first = manager.begin(
			[vscode.LanguageModelChatMessage.User('hello')],
			options,
		);
		const second = manager.begin(
			[vscode.LanguageModelChatMessage.User('hello')],
			options,
		);

		assert.notEqual(first.value, second.value);
		assert.match(first.value, /^[A-Za-z0-9_-]{32}$/u);
		assert.match(second.value, /^[A-Za-z0-9_-]{32}$/u);
	});

	it('keeps the fallback stable for follow-up turns with matching history', () => {
		const manager = new SessionAffinityManager();
		const options = {
			toolMode: vscode.LanguageModelChatToolMode.Auto,
		} as vscode.ProvideLanguageModelChatResponseOptions;

		const initial = manager.begin(
			[vscode.LanguageModelChatMessage.User('hello')],
			options,
		);
		initial.recordAssistantResponse({
			content: 'hi',
			reasoning: '',
			toolCalls: [],
		});

		const followUp = manager.begin(
			[
				vscode.LanguageModelChatMessage.User('hello'),
				vscode.LanguageModelChatMessage.Assistant('hi'),
				vscode.LanguageModelChatMessage.User('again'),
			],
			options,
		);
		const other = manager.begin(
			[vscode.LanguageModelChatMessage.User('different')],
			options,
		);

		assert.equal(initial.value, followUp.value);
		assert.notEqual(initial.value, other.value);
	});
});

function expectedAffinity(value: string): string {
	return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}
