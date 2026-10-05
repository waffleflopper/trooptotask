import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseRatingSchemeExportReader } from './ratingSchemeRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const cases = [
	{
		table: 'rating_scheme_entries',
		saved: {
			rated_person_id: 'archived-person',
			eval_type: 'OER',
			rater_person_id: 'removed-rater',
			rater_name: null,
			senior_rater_person_id: null,
			senior_rater_name: 'LTC External',
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: 'removed-reviewer',
			reviewer_name: null,
			rating_period_start: '2025-09-30',
			rating_period_end: '2026-09-29',
			status: 'completed',
			notes: 17,
			report_type: '02',
			workflow_status: null,
			created_at: '2025-09-30T01:02:03.654321Z',
			updated_at: '2026-09-29T01:02:03.123456Z'
		}
	}
] as const;

function provider(table: string, saved: Row) {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(index).padStart(4, '0')}`,
		organization_id: ORG,
		unknown_saved_history: { nested: [null, false, { value: '  LEGACY  ' }] }
	}));
	owned[1000] = { ...owned[1000], status: 'change-of-rater', workflow_status: 'with-rater' };
	const rows: Row[] = [{ ...owned[0], id: 'foreign-row', organization_id: 'org-b' }, ...owned.toReversed()];

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

describe('RatingScheme ordinary Organization archive reads', () => {
	it.each(cases)(
		'retains saved $table rows across pages and excludes a foreign Organization',
		async ({ table, saved }) => {
			const { client, owned } = provider(table, saved);
			expect(await createSupabaseRatingSchemeExportReader(client, ORG).listRows()).toEqual(owned);
			expect(await createSupabaseRatingSchemeExportReader(client, 'empty-org').listRows()).toEqual([]);
		}
	);

	it.each(cases)(
		'rejects first and late $table failures without returning partial history',
		async ({ table, saved }) => {
			const { client, state } = provider(table, saved);
			for (const from of [0, 1000]) {
				state.failFrom = from;
				await expect(createSupabaseRatingSchemeExportReader(client, ORG).listRows()).rejects.toThrow(
					'Saved rows unavailable'
				);
			}
		}
	);

	it('keeps an error-free null provider response empty', async () => {
		const { client, state } = provider(cases[0].table, cases[0].saved);
		state.nullData = true;
		expect(await createSupabaseRatingSchemeExportReader(client, ORG).listRows()).toEqual([]);
	});
});
