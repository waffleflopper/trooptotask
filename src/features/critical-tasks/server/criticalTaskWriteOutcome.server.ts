import { z } from 'zod';
import type { Json } from '$lib/server/database.types';
import { RequestFailure } from '$lib/errors';
import { CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE } from '../contracts';

const WRITE_UNCONFIRMED = 'write-unconfirmed';
const READBACK_IDS_PER_REQUEST = 50;
const READBACK_REQUESTS_PER_WINDOW = 4;

// postgrest-js reports a lost connection as status 0.
export function isUnknownWriteStatus(status: number): boolean {
	return status === 0 || status >= 500;
}

export function unconfirmedWrite(): RequestFailure {
	return new RequestFailure(503, CRITICAL_TASK_WRITE_UNCONFIRMED_MESSAGE, {
		publicMessage: true,
		reason: WRITE_UNCONFIRMED
	});
}

export function writeUnconfirmed(): never {
	throw unconfirmedWrite();
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

export type ImportRow = {
	op: 'insert' | 'update';
	id: string;
	values: { [column: string]: Json | undefined };
};

const importReplySchema = z.array(
	z.union([
		z.object({ row: z.record(z.string(), z.unknown()) }),
		z.object({ code: z.string(), constraint: z.string().nullable() })
	])
);

/**
 * Reads the reply of one import command. Each row is its saved record or the error that undid that row alone. A reply
 * that is lost or unreadable leaves the outcome unknown, so the created rows are read back and every other row stays
 * unconfirmed.
 */
export async function importOutcomes<S, T extends { id: string }>(
	rows: ImportRow[],
	reply: { data: unknown; error: { message: string } | null; status: number },
	read: {
		map: (row: S) => unknown;
		schema: z.ZodType<T>;
		readBack: (ids: string[]) => Promise<unknown[]>;
		rowError: (code: string, constraint: string | null) => Error;
	}
): Promise<Array<T | Error>> {
	if (reply.error && !isUnknownWriteStatus(reply.status)) throw new Error(reply.error.message);
	const parsed = reply.error ? null : importReplySchema.safeParse(reply.data);
	if (parsed?.success && parsed.data.length === rows.length) {
		const outcomes = parsed.data.map((outcome, index) =>
			'row' in outcome
				? acknowledgedRows([outcome.row], [rows[index].id], read.map, read.schema)?.[0]
				: read.rowError(outcome.code, outcome.constraint)
		);
		if (outcomes.every((outcome): outcome is T | Error => outcome !== undefined)) return outcomes;
	}
	const created = await confirmInsertedRows(
		rows.filter((row) => row.op === 'insert').map((row) => row.id),
		read.readBack,
		read.schema
	);
	const confirmed = new Map(created.map((row) => [row.id, row]));
	return rows.map((row) => confirmed.get(row.id) ?? unconfirmedWrite());
}
