import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseSignInRosterExportReader } from './signInRosterExportRead.server';

type Row = Record<string, unknown>;
const ORG = 'org-a';
const saved = {
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
	created_at: '2026-01-02T03:04:05.123456Z',
	personnel_ids: ['removed-person'],
	scope_group_ids: [],
	unknown_history: { imported: [null, false, { source: 'retired-system', rank: '  LEGACY  ' }] }
};

function provider() {
	const owned: Row[] = Array.from({ length: 1001 }, (_, index) => ({
		...saved,
		id: `saved-${String(index).padStart(4, '0')}`
	}));
	const rows: Row[] = [{ ...saved, id: 'foreign-row', organization_id: 'org-b' }, ...owned.toReversed()];
	const state = { failFrom: null as number | null };
	const client = createClient('http://archive.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (
					url.origin !== 'http://archive.invalid' ||
					url.pathname !== '/rest/v1/sign_in_rosters' ||
					request.method !== 'GET'
				)
					throw new Error('Unexpected archive provider operation');
				if (
					request.headers.get('apikey') !== 'synthetic-request-key' ||
					request.headers.get('authorization') !== 'Bearer synthetic-request-key'
				)
					throw new Error('Archive read must retain ordinary request authority');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (state.failFrom !== null && offset >= state.failFrom)
					return Response.json({ code: '42501', message: 'Saved rows unavailable' }, { status: 403 });
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
						(left, right) => String(left[column]).localeCompare(String(right[column])) * (direction === 'desc' ? -1 : 1)
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
	return { client, state, owned };
}

describe('Sign-in Roster ordinary Organization export reads', () => {
	it('retains every saved field and ordered page without foreign rows or Group restrictions', async () => {
		const { client, owned } = provider();
		expect(await createSupabaseSignInRosterExportReader(client, ORG).listRows()).toEqual(owned);
		expect(await createSupabaseSignInRosterExportReader(client, 'empty-org').listRows()).toEqual([]);
	});

	it.each([0, 1000])('rejects failure at offset %s without returning partial saved history', async (from) => {
		const { client, state } = provider();
		state.failFrom = from;
		await expect(createSupabaseSignInRosterExportReader(client, ORG).listRows()).rejects.toThrow(
			'Saved rows unavailable'
		);
	});
});
