import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabasePersonnelCalendarScopeIds } from './calendarScopeIds.server';

type Row = { id: string; organization_id: string; group_id: string | null; archived_at?: string | null };

function provider(rows: Row[], failFrom?: number) {
	const requests: Request[] = [];
	const client = createClient('http://calendar-scope.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				requests.push(request);
				if (requests.length > 4) throw new Error('Scope ID request budget exceeded');
				const url = new URL(request.url);
				if (url.origin !== 'http://calendar-scope.invalid' || url.pathname !== '/rest/v1/personnel')
					throw new Error('Unexpected scope ID provider');
				if (request.method !== 'GET' || request.headers.get('authorization') !== 'Bearer ordinary-request-key')
					throw new Error('Scope ID read changed supplied authority');
				if (request.headers.get('apikey') !== 'ordinary-request-key') throw new Error('Scope ID read changed API key');
				const from = Number(url.searchParams.get('offset') ?? 0);
				if (failFrom !== undefined && from >= failFrom)
					return Response.json({ code: '42501', message: 'Scope IDs unavailable' }, { status: 403 });
				let visible = rows;
				for (const [column, filter] of url.searchParams) {
					if (column === 'organization_id' && filter.startsWith('eq.'))
						visible = visible.filter((row) => row.organization_id === filter.slice(3));
					else if (column === 'group_id' && filter.startsWith('in.(') && filter.endsWith(')')) {
						const groups = filter.slice(4, -1).split(',');
						visible = visible.filter((row) => row.group_id !== null && groups.includes(row.group_id));
					} else if (!['select', 'order', 'offset', 'limit'].includes(column))
						throw new Error('Unexpected scope ID predicate');
				}
				if (url.searchParams.get('select') !== 'id' || url.searchParams.get('order') !== 'id.asc')
					throw new Error('Scope ID projection or paging order changed');
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				return Response.json(
					visible
						.toSorted((a, b) => a.id.localeCompare(b.id))
						.slice(from, from + limit)
						.map(({ id }) => ({ id }))
				);
			}
		}
	});
	return { client, requests };
}

describe('ordinary Personnel IDs for Calendar availability scope', () => {
	const rows: Row[] = [
		{ id: 'active-a', organization_id: 'org-a', group_id: 'alpha', archived_at: null },
		{ id: 'archived-a', organization_id: 'org-a', group_id: 'alpha', archived_at: '2026-01-01' },
		{ id: 'beta-a', organization_id: 'org-a', group_id: 'beta' },
		{ id: 'hidden-a', organization_id: 'org-a', group_id: 'other' },
		{ id: 'ungrouped-a', organization_id: 'org-a', group_id: null },
		{ id: 'foreign-b', organization_id: 'org-b', group_id: 'alpha' }
	];

	it('includes active and archived IDs from only the admitted Organization and Groups', async () => {
		const { client } = provider(rows);
		expect(
			await createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'groups', groupIds: ['alpha', 'beta'] })()
		).toEqual(['active-a', 'archived-a', 'beta-a']);
	});

	it('retains ungrouped and archived IDs for Organization scope', async () => {
		const { client } = provider(rows);
		expect(await createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'organization' })()).toEqual([
			'active-a',
			'archived-a',
			'beta-a',
			'hidden-a',
			'ungrouped-a'
		]);
	});

	it('does not read persistence for an explicit empty Group scope', async () => {
		const { client, requests } = provider(rows, 0);
		expect(await createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'groups', groupIds: [] })()).toEqual(
			[]
		);
		expect(requests).toHaveLength(0);
	});

	it('returns an empty result when the admitted Groups contain no visible Personnel', async () => {
		const { client } = provider(rows);
		expect(
			await createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'groups', groupIds: ['missing'] })()
		).toEqual([]);
	});

	it('includes the final page of more than 1000 admitted Personnel', async () => {
		const expected = Array.from({ length: 1001 }, (_, index) => `person-${String(index).padStart(4, '0')}`);
		const { client, requests } = provider(expected.map((id) => ({ id, organization_id: 'org-a', group_id: 'alpha' })));
		expect(
			await createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'groups', groupIds: ['alpha'] })()
		).toEqual(expected);
		expect(requests).toHaveLength(2);
	});

	it.each([0, 1000])(
		'propagates a provider failure at offset %i instead of returning partial IDs',
		async (failFrom) => {
			const { client } = provider(
				Array.from({ length: 1001 }, (_, index) => ({
					id: `person-${index}`,
					organization_id: 'org-a',
					group_id: 'alpha'
				})),
				failFrom
			);
			await expect(
				createSupabasePersonnelCalendarScopeIds(client, 'org-a', { kind: 'groups', groupIds: ['alpha'] })()
			).rejects.toThrow('Scope IDs unavailable');
		}
	);
});
