import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseOrganizationOverviewCountsPort } from './overviewCountsProvider.server';
import { countScopesCoveringNoGroups } from './overviewCounts.server';

type Row = Record<string, unknown>;

const ORG = 'org-a';
const OTHER = 'org-b';

function fakeClient(tables: Record<string, Row[]>) {
	const requests: Array<{ method: string; table: string }> = [];
	const client = createClient('http://overview.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const table = url.pathname.replace('/rest/v1/', '');
				requests.push({ method: request.method, table });
				const matching = (tables[table] ?? []).filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
						if (filter.startsWith('eq.')) {
							if (String(row[column]) !== filter.slice(3)) return false;
						} else if (filter === 'is.null') {
							if (row[column] != null) return false;
						} else throw new Error(`Unexpected predicate ${column}=${filter}`);
					}
					return true;
				});
				if (request.method === 'HEAD') {
					return new Response(null, { status: 200, headers: { 'Content-Range': `*/${matching.length}` } });
				}
				const offset = Number(url.searchParams.get('offset') ?? 0);
				const limit = Number(url.searchParams.get('limit') ?? matching.length);
				const columns = (url.searchParams.get('select') ?? '').split(',');
				const page = matching
					.slice()
					.sort((a, b) => String(a.id).localeCompare(String(b.id)))
					.slice(offset, offset + limit)
					.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
				return Response.json(page);
			}
		}
	});
	return { requests, port: createSupabaseOrganizationOverviewCountsPort(client, ORG) };
}

function member(id: string, scope: Row, organizationId = ORG): Row {
	return { id, organization_id: organizationId, role: 'member', access_scope_kind: 'groups', ...scope };
}

describe('people without a Group', () => {
	it('counts active people with no Group in this Organization only', async () => {
		const { port } = fakeClient({
			personnel: [
				{ id: 'grouped', organization_id: ORG, group_id: 'alpha', archived_at: null },
				{ id: 'loose-1', organization_id: ORG, group_id: null, archived_at: null },
				{ id: 'loose-2', organization_id: ORG, group_id: null, archived_at: null },
				{ id: 'loose-archived', organization_id: ORG, group_id: null, archived_at: '2026-01-01T00:00:00Z' },
				{ id: 'other-org', organization_id: OTHER, group_id: null, archived_at: null }
			]
		});

		expect(await port.countActiveUngroupedPeople()).toBe(2);
	});

	it('answers with an exact head count and reads no rows', async () => {
		const { port, requests } = fakeClient({ personnel: [] });

		expect(await port.countActiveUngroupedPeople()).toBe(0);
		expect(requests).toEqual([{ method: 'HEAD', table: 'personnel' }]);
	});

	it('rejects when the provider refuses the count', async () => {
		const client = createClient('http://overview.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: async () => Response.json({ message: 'permission denied' }, { status: 403 }) }
		});

		await expect(
			createSupabaseOrganizationOverviewCountsPort(client, ORG).countActiveUngroupedPeople()
		).rejects.toThrow();
	});
});

describe('members whose scope covers no Groups', () => {
	const groups = [
		{ id: 'alpha', organization_id: ORG },
		{ id: 'bravo', organization_id: ORG },
		{ id: 'elsewhere', organization_id: OTHER }
	];

	it('counts an empty scope, a scope of only deleted Groups and one naming only another unit’s Group', async () => {
		const { port } = fakeClient({
			groups,
			organization_memberships: [
				member('empty', { access_scope_group_ids: [] }),
				member('deleted-only', { access_scope_group_ids: ['gone'] }),
				member('foreign-only', { access_scope_group_ids: ['elsewhere'] }),
				member('live', { access_scope_group_ids: ['alpha'] }),
				member('live-among-stale', { access_scope_group_ids: ['gone', 'bravo', 'also-gone'] }),
				member('org-wide', { access_scope_kind: 'organization', access_scope_group_ids: [] }),
				member('admin', { role: 'admin', access_scope_group_ids: [] }),
				member('owner', { role: 'owner', access_scope_group_ids: ['gone'] }),
				member('other-unit', { access_scope_group_ids: [] }, OTHER)
			]
		});

		expect(await port.countMembersCoveringNoGroups()).toBe(3);
	});

	it('counts past one page of members and never reads the roster', async () => {
		const stale = Array.from({ length: 1203 }, (_, i) =>
			member(`stale-${String(i).padStart(4, '0')}`, { access_scope_group_ids: ['gone'] })
		);
		const { port, requests } = fakeClient({
			groups,
			organization_memberships: [...stale, member('live', { access_scope_group_ids: ['alpha'] })]
		});

		expect(await port.countMembersCoveringNoGroups()).toBe(1203);
		expect(requests.some((request) => request.table === 'personnel')).toBe(false);
	});

	it('counts none when the unit has no members scoped to Groups', async () => {
		const { port } = fakeClient({ groups: [], organization_memberships: [] });

		expect(await port.countMembersCoveringNoGroups()).toBe(0);
	});

	it('rejects rather than undercount when a read fails', async () => {
		const client = createClient('http://overview.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: async () => Response.json({ message: 'permission denied' }, { status: 403 }) }
		});

		await expect(
			createSupabaseOrganizationOverviewCountsPort(client, ORG).countMembersCoveringNoGroups()
		).rejects.toThrow();
	});
});

describe('countScopesCoveringNoGroups', () => {
	it('counts a scope exactly when none of its ids is a live Group', () => {
		expect(countScopesCoveringNoGroups(['a', 'b'], [[], ['x'], ['x', 'a'], ['b'], null])).toBe(3);
	});
});
