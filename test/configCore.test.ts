import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEndpointUrl, normalizeBaseUrl } from '../src/configCore';

test('normalizeBaseUrl handles empty input', () => {
	assert.equal(normalizeBaseUrl(''), undefined);
	assert.equal(normalizeBaseUrl('   '), undefined);
	assert.equal(normalizeBaseUrl(undefined), undefined);
});

test('normalizeBaseUrl adds scheme and keeps instance URLs at the root', () => {
	assert.equal(normalizeBaseUrl('ai.long-antares.ts.net'), 'https://ai.long-antares.ts.net');
	assert.equal(
		normalizeBaseUrl('https://ai.long-antares.ts.net'),
		'https://ai.long-antares.ts.net',
	);
});

test('normalizeBaseUrl preserves /v1 as a normal instance path', () => {
	assert.equal(
		normalizeBaseUrl('https://ai.long-antares.ts.net/v1/'),
		'https://ai.long-antares.ts.net/v1',
	);
	assert.equal(
		normalizeBaseUrl('https://example.com/aperture/v1'),
		'https://example.com/aperture/v1',
	);
});

test('normalizeBaseUrl preserves instance paths', () => {
	assert.equal(
		normalizeBaseUrl('https://example.com/openai/'),
		'https://example.com/openai',
	);
	assert.equal(
		normalizeBaseUrl('https://example.com/openai/v1beta/'),
		'https://example.com/openai/v1beta',
	);
});

test('buildEndpointUrl appends OpenAI-compatible /v1 endpoint paths', () => {
	assert.equal(
		buildEndpointUrl('https://ai.long-antares.ts.net', '/models'),
		'https://ai.long-antares.ts.net/v1/models',
	);
	assert.equal(
		buildEndpointUrl('https://example.com/aperture', '/chat/completions'),
		'https://example.com/aperture/v1/chat/completions',
	);
});
