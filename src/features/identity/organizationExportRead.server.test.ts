import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { listGettingStartedProgressExportRows, listUserOrgPreferenceExportRows } from './organizationExportRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const USER = 'user-a';
const cases = [
	{
		table: 'getting_started_progress',
		read: listGettingStartedProgressExportRows,
		saved: {
			id: 'progress-a',
			organization_id: ORG,
			user_id: USER,
			dismissed_at: null,
			created_at: '2026-01-02T03:04:05.123456Z',
			retained_extra: { completed: false }
		}
	},
	{
		table: 'user_org_preferences',
		read: listUserOrgPreferenceExportRows,
		saved: {
			id: 'preference-a',
			organization_id: ORG,
			user_id: USER,
			preferences: { calendar: { collapsed: false }, unknown_saved_option: [null, 'retained'] },
			created_at: '2020-01-01T01:02:03.123456Z',
			updated_at: '2026-09-01T04:05:06.654321Z'
		}
	}
];

function provider(table: string, saved: Row) {
	const owned: Row[] = [saved];
	const peer = { ...saved, id: 'peer-row', user_id: 'peer' };
	const rows: Row[] = [{ ...saved, id: 'foreign-row', organization_id: 'org-b' }, ...owned, peer];
	const state = { failFrom: null as number | null, userId: USER };
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
				let visible = rows.filter((row) => row.user_id === state.userId);
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
	return { store: createSupabaseDataStore(client), state, owned, peer };
}

describe('Identity ordinary Organization export reads', () => {
	it.each(cases)('retains all saved $table fields without foreign rows', async ({ table, read, saved }) => {
		const { store, owned } = provider(table, saved);
		expect(await read(store, ORG)).toEqual(owned);
		expect(await read(store, 'empty-org')).toEqual([]);
	});

	it.each(cases)(
		'rejects $table provider failures without returning partial saved rows',
		async ({ table, read, saved }) => {
			const { store, state } = provider(table, saved);
			state.failFrom = 0;
			await expect(read(store, ORG)).rejects.toThrow('Saved rows unavailable');
		}
	);

	it.each(cases)('retains the request user visibility of $table', async ({ table, read, saved }) => {
		const { store, state, peer, owned } = provider(table, saved);
		expect(await read(store, ORG)).toEqual(owned);
		state.userId = 'peer';
		expect(await read(store, ORG)).toEqual([peer]);
	});
});
