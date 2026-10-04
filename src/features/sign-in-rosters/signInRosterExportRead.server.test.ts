import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { listSignInRosterExportRows } from './signInRosterExportRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'sign_in_rosters',
		read: listSignInRosterExportRows,
		saved: {
			id: 'roster-a',
			organization_id: ORG,
			title: 'Historic roster',
			roster_date: null,
			blank_date: true,
			separate_by_group: false,
			sort_by: 'rank',
			personnel_snapshot: [{ id: 'removed-person', rank: 'LEGACY', group: 'Old Group' }],
			filter_config: { groups: ['old-group'], include_archived: false },
			signed_file_path: 'org-a/sign-in-rosters/roster-a/signed.pdf',
			created_by: 'original-author',
			created_at: '2026-01-02T03:04:05.123456Z'
		}
	}
];

function provider(table: string, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({ ...saved, id: `saved-${index}` }));
	const rows: Row[] = [{ ...saved, id: 'foreign-row', organization_id: 'org-b' }, ...owned];
	const state = { failFrom: null as number | null };
	const client = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname.split('/').at(-1) !== table || (init?.method ?? 'GET') !== 'GET')
					throw new Error('Unexpected export provider operation');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
				let visible = rows;
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					if (filter === 'is.null') visible = visible.filter((row) => row[column] == null);
				}
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				const select = url.searchParams.get('select');
				return Response.json(
					visible
						.slice(offset, offset + limit)
						.map((row) =>
							!select || select === '*'
								? row
								: Object.fromEntries(select.split(',').map((column) => [column, row[column]]))
						)
				);
			}
		}
	});
	return { store: createSupabaseDataStore(client), state, owned };
}

describe('Sign-in Roster ordinary Organization export reads', () => {
	it.each(cases)('retains all saved $table fields and pages without foreign rows', async ({ table, read, saved }) => {
		const { store, owned } = provider(table, saved);
		expect(await read(store, ORG)).toEqual(owned);
		expect(await read(store, 'empty-org')).toEqual([]);
	});

	it.each(cases)(
		'rejects $table provider failures without returning partial saved rows',
		async ({ table, read, saved }) => {
			const { store, state } = provider(table, saved);
			state.failFrom = 1000;
			await expect(read(store, ORG)).rejects.toThrow('Saved rows unavailable');
			state.failFrom = 0;
			await expect(read(store, ORG)).rejects.toThrow('Saved rows unavailable');
		}
	);
});
