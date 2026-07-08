import assert from 'node:assert/strict';
import { formatUserAgent } from '../../src/runtime/userAgentCore';

describe('userAgentCore', () => {
	it('formatUserAgent includes extension, VS Code, Node, and platform details', () => {
		assert.equal(
			formatUserAgent({
				extensionName: 'aperture-for-copilot',
				extensionVersion: '0.1.0',
				vscodeVersion: '1.116.0',
				nodeVersion: 'v24.14.0',
				platform: 'win32',
				arch: 'x64',
			}),
			'aperture-for-copilot/0.1.0 vscode/1.116.0 node/24.14.0 win32/x64',
		);
	});

	it('formatUserAgent sanitizes invalid token characters', () => {
		assert.equal(
			formatUserAgent({
				extensionName: 'aperture for/c?p',
				extensionVersion: '0.1.0 beta',
				vscodeVersion: '1.116.0',
				nodeVersion: '24.14.0',
				platform: 'darwin',
				arch: 'arm64',
			}),
			'aperture-for-c-p/0.1.0-beta vscode/1.116.0 node/24.14.0 darwin/arm64',
		);
	});
});
