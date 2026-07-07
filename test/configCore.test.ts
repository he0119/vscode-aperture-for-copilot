import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEndpointUrl, normalizeBaseUrl } from '../src/configCore';

test('normalizeBaseUrl handles empty input', () => {
	assert.equal(normalizeBaseUrl(''), undefined);
	assert.equal(normalizeBaseUrl('   '), undefined);
	assert.equal(normalizeBaseUrl(undefined), undefined);
});

test('normalizeBaseUrl adds scheme and /v1 for bare hosts', () => {
	assert.equal(normalizeBaseUrl('ai.long-antares.ts.net'), 'https://ai.long-antares.ts.net/v1');
	assert.equal(
		normalizeBaseUrl('https://ai.long-antares.ts.net'),
		'https://ai.long-antares.ts.net/v1',
	);
});

test('normalizeBaseUrl preserves configured paths', () => {
	assert.equal(
		normalizeBaseUrl('https://ai.long-antares.ts.net/v1/'),
		'https://ai.long-antares.ts.net/v1',
	);
	assert.equal(
		normalizeBaseUrl('https://example.com/openai/'),
		'https://example.com/openai',
	);
});

test('buildEndpointUrl appends endpoint paths', () => {
	assert.equal(
		buildEndpointUrl('https://ai.long-antares.ts.net/v1', '/models'),
		'https://ai.long-antares.ts.net/v1/models',
	);
});
