import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabasePersonnelExportReader, type PersonnelExportTable } from './ordinaryExportRead.server';
import { createShiftingPostgrestClient } from '$lib/storage/test-support/shiftingPostgrest.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const USER = 'user-a';
const cases = [
	{
		table: 'groups',
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
] as const;

function provider(table: PersonnelExportTable, saved: Row, selfOwned: boolean) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(index).padStart(4, '0')}`,
		unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] },
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
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (request.headers.get('authorization') !== 'Bearer synthetic-request-key')
					throw new Error('Export read must retain ordinary request authority');
				if (url.pathname.split('/').at(-1) !== table || (init?.method ?? 'GET') !== 'GET')
					throw new Error('Unexpected export provider operation');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
				let visible = (offset > 0 ? rows.toReversed() : rows).filter(
					(row) => !selfOwned || row.user_id === state.userId
				);
				for (const [column, filter] of url.searchParams) {
					if (filter.startsWith('eq.')) visible = visible.filter((row) => String(row[column]) === filter.slice(3));
					if (filter === 'is.null') visible = visible.filter((row) => row[column] == null);
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
								: Object.fromEntries(select.split(',').map((column) => [column, row[column]]))
						)
				);
			}
		}
	});
	return { client, state, owned, peer };
}

describe('Personnel ordinary Organization export reads', () => {
	it('retains dated attribute history with composite keys across shifting pages and excludes foreign rows', async () => {
		const owned = ['person-a', 'person-b'].flatMap((personnel_id) =>
			Array.from({ length: 501 }, (_, day) => ({
				organization_id: ORG,
				personnel_id,
				effective_on: new Date(Date.UTC(2024, 0, day + 1)).toISOString().slice(0, 10),
				rank: 'SSG',
				mos: '68V',
				clinic_role: 'Therapist',
				group_id: null,
				archived: true
			}))
		);
		const client = createShiftingPostgrestClient({
			personnel_attribute_history: [
				...owned.toReversed(),
				{ ...owned[0], organization_id: 'org-b', personnel_id: 'foreign-person' }
			]
		});
		expect(await createSupabasePersonnelExportReader(client, ORG).listRows('personnel_attribute_history')).toEqual(
			owned
		);
	});

	it.each(cases)(
		'retains all saved $table fields and pages without foreign rows',
		async ({ table, saved, selfOwned }) => {
			const { client, owned } = provider(table, saved, selfOwned);
			expect(await createSupabasePersonnelExportReader(client, ORG).listRows(table)).toEqual(owned);
			expect(await createSupabasePersonnelExportReader(client, 'empty-org').listRows(table)).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects $table provider failures without returning partial saved rows',
		async ({ table, saved, selfOwned }) => {
			const { client, state } = provider(table, saved, selfOwned);
			state.failFrom = 1000;
			await expect(createSupabasePersonnelExportReader(client, ORG).listRows(table)).rejects.toThrow(
				'Saved rows unavailable'
			);
			state.failFrom = 0;
			await expect(createSupabasePersonnelExportReader(client, ORG).listRows(table)).rejects.toThrow(
				'Saved rows unavailable'
			);
		}
	);

	it.each(cases.filter(({ selfOwned }) => selfOwned))(
		'retains the request user visibility of $table',
		async ({ table, saved }) => {
			const { client, state, peer, owned } = provider(table, saved, true);
			expect(await createSupabasePersonnelExportReader(client, ORG).listRows(table)).toEqual(owned);
			state.userId = 'peer';
			expect(await createSupabasePersonnelExportReader(client, ORG).listRows(table)).toEqual([peer]);
		}
	);

	it('rejects an unrelated table before provider access', async () => {
		const fetch = vi.fn();
		const client = createClient('http://archive.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		});
		await expect(
			createSupabasePersonnelExportReader(client, ORG).listRows('access_requests' as PersonnelExportTable)
		).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});
});
