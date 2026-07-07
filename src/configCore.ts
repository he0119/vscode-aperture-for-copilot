export function normalizeBaseUrl(raw: string | undefined): string | undefined {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return undefined;
	}

	const withScheme = /^[a-z][a-z\d+\-.]*:\/\//iu.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	const url = new URL(withScheme);
	url.hash = '';
	url.search = '';

	const path = url.pathname.replace(/\/+$/u, '');
	url.pathname = path === '' ? '/v1' : path;

	return url.toString().replace(/\/$/u, '');
}

export function buildEndpointUrl(baseUrl: string, path: `/${string}`): string {
	return `${baseUrl.replace(/\/+$/u, '')}${path}`;
}
