import assert from 'node:assert/strict';
import { buildEndpointUrl, normalizeBaseUrl } from '../src/configCore';

describe('configCore', () => {
	it('normalizeBaseUrl handles empty input', () => {
		assert.equal(normalizeBaseUrl(''), undefined);
		assert.equal(normalizeBaseUrl('   '), undefined);
		assert.equal(normalizeBaseUrl(undefined), undefined);
	});

	it('normalizeBaseUrl adds scheme and keeps instance URLs at the root', () => {
		assert.equal(normalizeBaseUrl('aperture.example.com'), 'https://aperture.example.com');
		assert.equal(
			normalizeBaseUrl('https://aperture.example.com'),
			'https://aperture.example.com',
		);
	});

	it('normalizeBaseUrl preserves /v1 as a normal instance path', () => {
		assert.equal(
			normalizeBaseUrl('https://aperture.example.com/v1/'),
			'https://aperture.example.com/v1',
		);
		assert.equal(
			normalizeBaseUrl('https://example.com/aperture/v1'),
			'https://example.com/aperture/v1',
		);
	});

	it('normalizeBaseUrl preserves instance paths', () => {
		assert.equal(
			normalizeBaseUrl('https://example.com/openai/'),
			'https://example.com/openai',
		);
		assert.equal(
			normalizeBaseUrl('https://example.com/openai/v1beta/'),
			'https://example.com/openai/v1beta',
		);
	});

	it('buildEndpointUrl appends OpenAI-compatible /v1 endpoint paths', () => {
		assert.equal(
			buildEndpointUrl('https://aperture.example.com', '/models'),
			'https://aperture.example.com/v1/models',
		);
		assert.equal(
			buildEndpointUrl('https://example.com/aperture', '/chat/completions'),
			'https://example.com/aperture/v1/chat/completions',
		);
	});
});
