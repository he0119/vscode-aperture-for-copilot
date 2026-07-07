import * as vscode from 'vscode';
import { formatUserAgent } from './userAgentCore';

export function createUserAgent(context: vscode.ExtensionContext): string {
	const packageJson = context.extension.packageJSON as {
		name?: unknown;
		version?: unknown;
	};

	return formatUserAgent({
		extensionName: stringValue(packageJson.name) ?? 'aperture-for-copilot',
		extensionVersion: stringValue(packageJson.version) ?? '0.0.0',
		vscodeVersion: vscode.version,
		nodeVersion: process.versions.node,
		platform: process.platform,
		arch: process.arch,
	});
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
