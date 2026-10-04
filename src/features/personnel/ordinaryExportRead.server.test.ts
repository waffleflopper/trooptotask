import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import {
	listGroupExportRows,
	listPersonnelExportRows,
	listOrganizationRankCatalogExportRows,
	listUserPinnedGroupExportRows
} from './ordinaryExportRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const USER = 'user-a';
const cases = [
	{
		table: 'groups',
		read: listGroupExportRows,
		selfOwned: false,
		saved: {
			id: 'group-a',
			organization_id: ORG,
			name: 'Alpha',
			sort_order: 4,
			created_at: '2026-01-02T03:04:05.123456Z',
			retained_extra: { color: null }
		}
	},
	{
		table: 'personnel',
		read: listPersonnelExportRows,
		selfOwned: false,
		saved: {
			id: 'person-a',
			organization_id: ORG,
			first_name: 'Alex',
			last_name: 'Example',
			rank: 'SSG',
			mos: '68V',
			clinic_role: 'Therapist',
			group_id: 'group-a',
			ets: null,
			deros: '2027-01-01',
			archived_at: '2026-08-01T01:02:03Z',
			created_at: '2020-01-01T01:02:03.123456Z',
			updated_at: '2026-09-01T04:05:06.654321Z',
			retained_extra: ['history', null]
		}
	},
	{
		table: 'organization_rank_catalog',
		read: listOrganizationRankCatalogExportRows,
		selfOwned: false,
		saved: {
			id: 'rank-a',
			organization_id: ORG,
			code: 'LEGACY',
			label: 'Retired rank',
			service: 'custom',
			category: 'custom',
			pay_grade: 'ungraded',
			state: 'retired',
			source: 'custom',
			sort_order: 9,
			created_at: '2020-01-01T01:02:03.123456Z',
			updated_at: '2026-09-01T04:05:06.654321Z'
		}
	},
	{
		table: 'user_pinned_groups',
		read: listUserPinnedGroupExportRows,
		selfOwned: true,
		saved: {
			id: 'pin-a',
			organization_id: ORG,
			user_id: USER,
			group_name: 'Historic Group',
			sort_order: 3,
			created_at: '2026-01-02T03:04:05.123456Z'
		}
	}
];

function provider(table: string, saved: Row, selfOwned: boolean) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${index}`,
		...Object.fromEntries(
			['name', 'code', 'group_name']
				.filter((column) => column in saved)
				.map((column) => [column, `${saved[column]} ${index}`])
		)
	}));
	const peer = { ...saved, id: 'peer-row', user_id: 'peer' };
	const rows: Row[] = [
		{ ...saved, id: 'foreign-row', organization_id: 'org-b' },
		...owned,
		...(selfOwned ? [peer] : [])
	];
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
				let visible = rows.filter((row) => !selfOwned || row.user_id === state.userId);
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

describe('Personnel ordinary Organization export reads', () => {
	it.each(cases)(
		'retains all saved $table fields and pages without foreign rows',
		async ({ table, read, saved, selfOwned }) => {
			const { store, owned } = provider(table, saved, selfOwned);
			expect(await read(store, ORG)).toEqual(owned);
			expect(await read(store, 'empty-org')).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects $table provider failures without returning partial saved rows',
		async ({ table, read, saved, selfOwned }) => {
			const { store, state } = provider(table, saved, selfOwned);
			state.failFrom = 1000;
			await expect(read(store, ORG)).rejects.toThrow('Saved rows unavailable');
			state.failFrom = 0;
			await expect(read(store, ORG)).rejects.toThrow('Saved rows unavailable');
		}
	);

	it.each(cases.filter(({ selfOwned }) => selfOwned))(
		'retains the request user visibility of $table',
		async ({ table, read, saved }) => {
			const { store, state, peer, owned } = provider(table, saved, true);
			expect(await read(store, ORG)).toEqual(owned);
			state.userId = 'peer';
			expect(await read(store, ORG)).toEqual([peer]);
		}
	);
});
