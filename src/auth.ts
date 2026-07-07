import * as vscode from 'vscode';
import { API_KEY_SECRET } from './constants';

export class AuthManager {
	constructor(private readonly context: vscode.ExtensionContext) {}

	async getApiKey(): Promise<string | undefined> {
		const value = await this.context.secrets.get(API_KEY_SECRET);
		return value?.trim() || undefined;
	}

	async hasApiKey(): Promise<boolean> {
		return Boolean(await this.getApiKey());
	}

	async promptForApiKey(): Promise<boolean> {
		const apiKey = await vscode.window.showInputBox({
			title: 'Aperture API Key',
			prompt: 'Paste an API key if this Aperture endpoint requires one.',
			password: true,
			ignoreFocusOut: true,
		});

		if (apiKey === undefined) {
			return false;
		}

		const trimmed = apiKey.trim();
		if (!trimmed) {
			await this.deleteApiKey();
			return true;
		}

		await this.context.secrets.store(API_KEY_SECRET, trimmed);
		return true;
	}

	async deleteApiKey(): Promise<void> {
		await this.context.secrets.delete(API_KEY_SECRET);
	}
}
