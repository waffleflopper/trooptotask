import type { z } from 'zod';

export type ImportChunkReply<T> =
	| { kind: 'saved'; data: T }
	| { kind: 'refused'; message: string }
	| { kind: 'unconfirmed' };

async function readResponseErrorMessage(response: Response, fallback: string): Promise<string> {
	try {
		const data = await response.json();
		if (typeof data === 'string' && data.trim()) return data.trim();
		if (data && typeof data === 'object') {
			const record = data as Record<string, unknown>;
			const detail = [record.message, record.error, record.details].find(
				(value) => typeof value === 'string' && value.trim().length > 0
			);
			if (typeof detail === 'string') return detail;
		}
	} catch {
		return fallback;
	}

	return fallback;
}

export async function postImportChunk<T>(
	url: string,
	body: unknown,
	options: { fallbackMessage: string; schema: z.ZodType<T> }
): Promise<ImportChunkReply<T>> {
	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		return { kind: 'unconfirmed' };
	}
	if (!response.ok) {
		if (response.status >= 500) return { kind: 'unconfirmed' };
		return { kind: 'refused', message: await readResponseErrorMessage(response, options.fallbackMessage) };
	}
	try {
		const parsed = options.schema.safeParse(await response.json());
		return parsed.success ? { kind: 'saved', data: parsed.data } : { kind: 'unconfirmed' };
	} catch {
		return { kind: 'unconfirmed' };
	}
}
