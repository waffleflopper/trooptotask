import type { z } from 'zod';
import { fail, RequestFailure } from '$lib/errors';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE } from '../contracts';

const WRITE_UNCONFIRMED = 'write-unconfirmed';
const READBACK_IDS_PER_REQUEST = 50;
const READBACK_REQUESTS_PER_WINDOW = 4;

// postgrest-js reports a lost connection as status 0.
export function isUnknownWriteStatus(status: number): boolean {
	return status === 0 || status >= 500;
}

export function writeUnconfirmed(): never {
	fail(503, CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE, { publicMessage: true, reason: WRITE_UNCONFIRMED });
}

export function isUnconfirmedWrite(error: unknown): boolean {
	return error instanceof RequestFailure && error.reason === WRITE_UNCONFIRMED;
}

export function acknowledgedRows<S, T extends { id: string }>(
	data: unknown,
	ids: string[],
	map: (row: S) => unknown,
	schema: z.ZodType<T>
): T[] | null {
	if (!Array.isArray(data) || data.length !== ids.length) return null;
	const expected = new Set(ids);
	const rows: T[] = [];
	for (const row of data) {
		if (!row || typeof row !== 'object') return null;
		const parsed = schema.safeParse(map(row as S));
		if (!parsed.success || !expected.delete(parsed.data.id)) return null;
		rows.push(parsed.data);
	}
	return rows;
}

export async function readBackInChunks<T>(ids: string[], read: (ids: string[]) => Promise<T[]>): Promise<T[]> {
	const rows: T[] = [];
	const window = READBACK_IDS_PER_REQUEST * READBACK_REQUESTS_PER_WINDOW;
	for (let index = 0; index < ids.length; index += window) {
		const pending: Array<Promise<T[]>> = [];
		for (let offset = index; offset < Math.min(index + window, ids.length); offset += READBACK_IDS_PER_REQUEST) {
			pending.push(read(ids.slice(offset, offset + READBACK_IDS_PER_REQUEST)));
		}
		rows.push(...(await Promise.all(pending)).flat());
	}
	return rows;
}

export async function confirmInsertedRows<T extends { id: string }>(
	ids: string[],
	read: (ids: string[]) => Promise<unknown[]>,
	schema: z.ZodType<T>
): Promise<T[]> {
	const found = new Map<string, T>();
	try {
		for (const row of await readBackInChunks(ids, read)) {
			const parsed = schema.safeParse(row);
			if (parsed.success) found.set(parsed.data.id, parsed.data);
		}
	} catch {
		writeUnconfirmed();
	}
	const confirmed = ids.map((id) => found.get(id));
	if (confirmed.some((row) => !row)) writeUnconfirmed();
	return confirmed as T[];
}
