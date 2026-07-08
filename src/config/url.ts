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
	url.pathname = path || '/';

	return url.toString().replace(/\/$/u, '');
}

export function buildEndpointUrl(baseUrl: string, path: `/${string}`): string {
	const instanceUrl = baseUrl.replace(/\/+$/u, '');
	return `${instanceUrl}/v1${path}`;
}
