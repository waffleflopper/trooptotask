import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseCalendarExportReader, type CalendarExportTable } from './calendarExportRead.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/test-support/shiftingPostgrest';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'status_types',
		saved: {
			name: 'Historic',
			color: '#123456',
			text_color: '#abcdef',
			sort_order: 7,
			created_at: '2026-01-02T03:04:05.123456Z'
		}
	},
	{
		table: 'availability_entries',
		saved: {
			personnel_id: 'archived-person',
			status_type_id: 'retired-status',
			start_date: '2020-01-01',
			end_date: null,
			note: 17
		}
	},
	{
		table: 'assignment_types',
		saved: {
			name: 'Historic',
			short_name: null,
			assign_to: 'group',
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			archived_at: '2026-01-02T03:04:05.123456Z'
		}
	},
	{
		table: 'daily_assignments',
		saved: {
			date: '2020-01-01',
			assignment_type_id: 'retired-assignment',
			personnel_id: null,
			group_id: 'removed-group',
			slot: 3
		}
	},
	{
		table: 'special_days',
		saved: { name: null, date: '2020-01-01', type: 'legacy', notes: false, created_at: '2026-01-02T03:04:05.123456Z' }
	},
	{
		table: 'roster_forms',
		saved: {
			assignment_type_id: 'retired-assignment',
			starts_on: '2020-01-01',
			ends_on: '2020-01-31',
			rules: { weekendMode: 'separate', pool: null },
			record: { counts: [{ personnel_id: 'archived-person', count: 7 }] },
			created_at: '2020-01-01T03:04:05.123456Z'
		}
	},
	{
		table: 'roster_excusals',
		saved: {
			assignment_type_id: 'retired-assignment',
			personnel_id: 'archived-person',
			reason: 'Temporary duty',
			starts_on: '2020-01-01',
			ends_on: null,
			created_at: '2020-01-01T03:04:05.123456Z'
		}
	}
] as const;

function provider(table: CalendarExportTable, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(1001 - index).padStart(4, '0')}`,
		organization_id: ORG,
		...(table === 'status_types' ? {} : { unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] } })
	}));
	const rows: Row[] = [
		{ ...owned[0], id: 'foreign-row', organization_id: 'org-b' },
		...owned.map((row) => ({ ...row }))
	];
	if (table === 'status_types') for (const row of rows) row.unknown_status_field = { discarded: true };
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

describe('Calendar ordinary Organization archive reads', () => {
	it('retains starting numbers with composite keys across shifting pages and excludes foreign rows', async () => {
		const owned = ['form-a', 'form-b'].flatMap((form_id) =>
			pagedIds(167, 'person').flatMap((personnel_id) =>
				['all', 'weekday', 'weekend'].map((track) => ({
					organization_id: ORG,
					form_id,
					personnel_id,
					track,
					count: 7,
					origin: 'carried'
				}))
			)
		);
		const client = createShiftingPostgrestClient({
			roster_starting_numbers: [
				...owned.toReversed(),
				{ ...owned[0], organization_id: 'org-b', form_id: 'foreign-form' }
			]
		});
		expect(await createSupabaseCalendarExportReader(client, ORG).listRows('roster_starting_numbers')).toEqual(owned);
	});

	it.each(cases)(
		'retains saved $table rows in id order across pages and excludes a foreign Organization',
		async ({ table, saved }) => {
			const { client, owned } = provider(table, saved);
			expect(await createSupabaseCalendarExportReader(client, ORG).listRows(table)).toEqual(owned.toReversed());
			expect(await createSupabaseCalendarExportReader(client, 'empty-org').listRows(table)).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects first and late $table failures without returning partial history',
		async ({ table, saved }) => {
			const { client, state } = provider(table, saved);
			for (const from of [0, 1000]) {
				state.failFrom = from;
				await expect(createSupabaseCalendarExportReader(client, ORG).listRows(table)).rejects.toThrow(
					'Saved rows unavailable'
				);
			}
		}
	);

	it('keeps an error-free null provider response empty', async () => {
		const { client, state } = provider(cases[0].table, cases[0].saved);
		state.nullData = true;
		expect(await createSupabaseCalendarExportReader(client, ORG).listRows(cases[0].table)).toEqual([]);
	});

	it('rejects an unrelated table before provider access', async () => {
		const fetch = vi.fn();
		const client = createClient('http://archive.invalid', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch }
		});
		await expect(
			createSupabaseCalendarExportReader(client, ORG).listRows('access_requests' as CalendarExportTable)
		).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});

	it.each(cases)('returns each saved $table row once when physical order shifts between pages', async ({ table }) => {
		const ids = pagedIds(1001);
		const client = createShiftingPostgrestClient({ [table]: ids.map((id) => ({ id, organization_id: ORG })) });
		const rows = await createSupabaseCalendarExportReader(client, ORG).listRows(table);
		expect(rows.map((row) => row.id).toSorted()).toEqual(ids);
	});
});
