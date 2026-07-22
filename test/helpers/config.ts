import * as vscode from 'vscode';

const CONFIG_SECTION = 'aperture-copilot';

const CONFIG_KEYS = [
	'baseUrl',
	'modelMetadataUrl',
	'enabledModelIds',
	'models',
	'maxTokens',
	'toolLimit',
	'debugMode',
] as const;

export async function resetApertureConfig(): Promise<void> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	await Promise.all(
		CONFIG_KEYS.map((key) =>
			config.update(key, undefined, vscode.ConfigurationTarget.Global),
		),
	);
}

export async function updateApertureConfig(
	values: Record<string, unknown>,
): Promise<void> {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
	for (const [key, value] of Object.entries(values)) {
		await config.update(key, value, vscode.ConfigurationTarget.Global);
	}
}
