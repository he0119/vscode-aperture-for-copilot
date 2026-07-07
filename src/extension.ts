import * as vscode from 'vscode';
import { ApertureChatProvider } from './provider';
import { logger } from './logger';

let provider: ApertureChatProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	provider = new ApertureChatProvider(context);
	provider.register();

	try {
		await vscode.extensions.getExtension('github.copilot-chat')?.activate();
		provider.refreshModels();
	} catch (error) {
		logger.debug('Copilot Chat activation unavailable; Aperture models will refresh later', error);
	}

	logger.info('Aperture for Copilot activated');
}

export async function deactivate(): Promise<void> {
	await provider?.prepareForDeactivate();
	logger.info('Aperture for Copilot deactivated');
	logger.dispose();
}
