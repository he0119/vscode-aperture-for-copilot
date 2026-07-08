export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const trimmed = value?.trim();
		if (!trimmed || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

export function normalizeKey(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? '';
}

export function slugKey(value: string | undefined): string {
	return (
		value
			?.trim()
			.toLowerCase()
			.replace(/['"]/gu, '')
			.replace(/[^a-z0-9]+/gu, '-')
			.replace(/^-+|-+$/gu, '') ?? ''
	);
}

export function suffixAfterSlash(value: string): string {
	return value.includes('/') ? (value.split('/').pop() ?? value) : value;
}

export function booleanValue(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export function positiveInteger(value: unknown): number | undefined {
	if (typeof value === 'number') {
		return Number.isSafeInteger(value) && value > 0 ? value : undefined;
	}
	if (typeof value !== 'string') {
		return undefined;
	}
	const match = value.trim().replace(/[, _]/gu, '').match(/^(\d+(?:\.\d+)?)([kKmM])?$/u);
	if (!match) {
		return undefined;
	}
	const amount = Number(match[1]);
	const multiplier = match[2]?.toLowerCase() === 'm' ? 1_000_000 : match[2] ? 1_000 : 1;
	const normalized = amount * multiplier;
	return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : undefined;
}
