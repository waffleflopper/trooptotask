import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseDataExportReader } from './dataExportRead.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/test-support/shiftingPostgrest';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'data_exports',
		saved: {
			requested_by: 'former-admin',
			status: 'failed',
			file_size_bytes: null,
			created_at: '2026-01-02T03:04:05.123456Z',
			completed_at: '2026-01-02T03:04:06.654321Z'
		}
	}
] as const;

function provider(table: string, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(1001 - index).padStart(4, '0')}`,
		org_id: ORG,
		unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] }
	}));
	owned[0] = { ...owned[0], status: 'completed', file_size_bytes: 2048 };
	owned[1] = { ...owned[1], status: 'processing', completed_at: null };
	const rows: Row[] = [{ ...owned[0], id: 'foreign-row', org_id: 'org-b' }, ...owned];

	const state = { failFrom: null as number | null, nullData: false };
	const client = createClient('http://archive.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://archive.invalid' || url.pathname !== `/rest/v1/${table}` || request.method !== 'GET')
					throw new Error('Unexpected archive provider operation');
				if (
					request.headers.get('authorization') !== 'Bearer synthetic-request-key' ||
					request.headers.get('apikey') !== 'synthetic-request-key'
				)
					throw new Error('Archive read must retain ordinary request authority');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
				if (state.nullData) return Response.json(null);
				let visible = rows;
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					else if (!['select', 'order', 'offset', 'limit'].includes(column))
						throw new Error('Unexpected archive predicate');
				}
				const ordering = url.searchParams.get('order');
				if (ordering) {
					const [column, direction] = ordering.split('.');
					visible = visible.toSorted(
						(a, b) => String(a[column]).localeCompare(String(b[column])) * (direction === 'desc' ? -1 : 1)
					);
				}
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const select = url.searchParams.get('select');
				return Response.json(
					visible
						.slice(offset, offset + limit)
						.map((row) =>
							!select || select === '*'
								? row
								: Object.fromEntries(select.split(',').map((column) => [column.trim(), row[column.trim()]]))
						)
				);
			}
		}
	});
	return { client, state, owned };
}

describe('DataExport ordinary Organization archive reads', () => {
	it.each(cases)(
		'retains saved $table rows in id order across pages and excludes a foreign Organization',
		async ({ table, saved }) => {
			const { client, owned } = provider(table, saved);
			expect(await createSupabaseDataExportReader(client, ORG).listRows()).toEqual(owned.toReversed());
			expect(await createSupabaseDataExportReader(client, 'empty-org').listRows()).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects first and late $table failures without returning partial history',
		async ({ table, saved }) => {
			const { client, state } = provider(table, saved);
			for (const from of [0, 1000]) {
				state.failFrom = from;
				await expect(createSupabaseDataExportReader(client, ORG).listRows()).rejects.toThrow('Saved rows unavailable');
			}
		}
	);

	it('keeps an error-free null provider response empty', async () => {
		const { client, state } = provider(cases[0].table, cases[0].saved);
		state.nullData = true;
		expect(await createSupabaseDataExportReader(client, ORG).listRows()).toEqual([]);
	});

	it('returns each saved row once when physical order shifts between pages', async () => {
		const ids = pagedIds(1001);
		const client = createShiftingPostgrestClient({ data_exports: ids.map((id) => ({ id, org_id: ORG })) });
		const rows = await createSupabaseDataExportReader(client, ORG).listRows();
		expect(rows.map((row) => row.id).toSorted()).toEqual(ids);
	});
});
