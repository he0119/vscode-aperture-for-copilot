export interface UserAgentMetadata {
	extensionName: string;
	extensionVersion: string;
	vscodeVersion: string;
	nodeVersion: string;
	platform: string;
	arch: string;
}

export function formatUserAgent(metadata: UserAgentMetadata): string {
	const extensionName = sanitizeProductToken(metadata.extensionName) || 'aperture-for-copilot';
	const extensionVersion = sanitizeProductVersion(metadata.extensionVersion) || '0.0.0';
	const vscodeVersion = sanitizeProductVersion(metadata.vscodeVersion) || 'unknown';
	const nodeVersion = sanitizeProductVersion(metadata.nodeVersion.replace(/^v/u, '')) || 'unknown';
	const platform = sanitizeProductToken(metadata.platform) || 'unknown';
	const arch = sanitizeProductToken(metadata.arch) || 'unknown';

	return `${extensionName}/${extensionVersion} vscode/${vscodeVersion} node/${nodeVersion} ${platform}/${arch}`;
}

function sanitizeProductToken(value: string): string {
	return value.trim().replace(/[^A-Za-z0-9._~-]/gu, '-');
}

function sanitizeProductVersion(value: string): string {
	return value.trim().replace(/[^A-Za-z0-9._~+-]/gu, '-');
}
