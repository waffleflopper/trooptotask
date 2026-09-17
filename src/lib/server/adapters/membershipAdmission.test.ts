import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { MembershipRow } from '$lib/server/permissionContext';
import { cacheRequestMembership } from '$lib/server/membershipContextCache';
import {
	buildLayoutContext,
	buildLayoutContextFromMembership,
	buildRouteContext,
	handle,
	loadWithContext
} from './httpAdapter';

const { adminClient } = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock('$lib/server/supabase', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/supabase')>()),
	getAdminClient: adminClient
}));
vi.mock('$lib/config/billing', () => ({ isBillingEnabled: false }));

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';
const member: MembershipRow = {
	id: 'membership-a',
	role: 'member',
	member_preset: 'operator',
	capability_overrides: { personnel: 'configure', training: 'none', ratingScheme: 'configure' },
	access_scope_kind: 'groups',
	access_scope_group_ids: ['group-a', 'group-b']
};
type Row = Record<string, unknown>;

// A small PostgREST transport fake: it applies the filters actually emitted by the SDK.
// It deliberately supplies no RLS, so missing application filters cannot pass by accident.
function fixture(membership: MembershipRow = member) {
	const tables: Record<string, Row[]> = {
		organization_memberships: [
			{ ...membership, user_id: USER, organization_id: ORG },
			{ id: 'foreign-user', role: 'owner', user_id: OTHER_USER, organization_id: ORG },
			{ id: 'foreign-org', role: 'owner', user_id: USER, organization_id: OTHER_ORG }
		],
		organizations: [
			{ id: ORG, name: 'Alpha', url_slug: 'alpha', suspended_at: null },
			{ id: OTHER_ORG, name: 'Bravo', url_slug: 'bravo', suspended_at: null }
		],
		personnel: [
			{ id: 'person-a', organization_id: ORG, group_id: 'group-a' },
			{ id: 'person-b', organization_id: ORG, group_id: 'group-b' },
			{ id: 'person-c', organization_id: ORG, group_id: 'group-c' },
			{ id: 'ungrouped', organization_id: ORG, group_id: null },
			{ id: 'foreign-person', organization_id: OTHER_ORG, group_id: 'group-a' }
		],
		audit_logs: []
	};
	const state = { failedTable: '', membershipReads: 0 };
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		expect(url.origin).toBe('http://membership.invalid');
		const table = url.pathname.split('/').at(-1)!;
		if (!(table in tables)) throw new Error(`Unexpected provider table: ${table}`);
		if (table === 'organization_memberships') state.membershipReads++;
		if (table === state.failedTable) {
			return Response.json({ code: 'XX000', message: 'synthetic provider failure' }, { status: 500 });
		}
		if (init?.method === 'POST') {
			const row = JSON.parse(String(init.body));
			tables[table].push(row);
			return Response.json(row, { status: 201 });
		}
		expect(init?.method ?? 'GET').toBe('GET');
		let rows = tables[table].filter((row) =>
			[...url.searchParams].every(([key, filter]) => {
				if (['select', 'offset', 'limit'].includes(key)) return true;
				if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
				if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
				throw new Error(`Unexpected provider filter: ${key}=${filter}`);
			})
		);
		const select = url.searchParams.get('select');
		if (select && select !== '*')
			rows = rows.map((row) => Object.fromEntries(select.split(',').map((key) => [key, row[key]])));
		if (new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')) {
			return rows.length === 1
				? Response.json(rows[0])
				: Response.json({ code: 'PGRST116', message: 'Expected one row' }, { status: 406 });
		}
		return Response.json(rows);
	});
	const supabase = createClient('http://membership.invalid', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch }
	});
	// The service client is never used to establish membership. Keep any audit output local too.
	adminClient.mockReturnValue(supabase);
	const locals = { user: { id: USER }, supabase, session: null } as App.Locals;
	return { tables, state, fetch, locals };
}

function event(locals: App.Locals, orgId = ORG): RequestEvent {
	return {
		locals,
		params: { orgId },
		cookies: {},
		request: new Request(`http://app.invalid/api/org/${orgId}/personnel`, { method: 'POST', body: '{}' }),
		getClientAddress: () => '127.0.0.1'
	} as RequestEvent;
}

const write = handle({
	policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
	policyResource: { kind: 'group', groupId: 'group-b' },
	mutation: true,
	fn: async (ctx) => ctx.store.insert('personnel', ctx.auth.orgId, { id: 'created', group_id: 'group-b' })
});

afterEach(() => vi.restoreAllMocks());

describe('request membership admission through real context construction', () => {
	it.each(['route', 'layout', 'prefetched'] as const)(
		'keeps both Groups and independent lane overrides in the %s context',
		async (path) => {
			const f = fixture();
			const ctx =
				path === 'route'
					? await buildRouteContext(event(f.locals))
					: path === 'layout'
						? await buildLayoutContext(f.locals, {} as never, ORG)
						: await buildLayoutContextFromMembership(f.locals, {} as never, ORG, member);
			expect(ctx.auth).toMatchObject({
				userId: USER,
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				capabilityMap: { personnel: 'configure', training: 'none', ratingScheme: 'configure' },
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] }
			});
			const visible = await ctx.store.findMany<{ id: string }>('personnel', ctx.auth.orgId);
			expect(visible.map((row) => row.id)).toEqual(['person-a', 'person-b']);
			await expect(ctx.scope.requireGroupAccessBatch(['person-a', 'person-b'])).resolves.toBeUndefined();
			await expect(ctx.scope.requireGroupAccess('person-c')).rejects.toMatchObject({ status: 403 });
			await expect(ctx.scope.requireGroupAccess('ungrouped')).rejects.toMatchObject({ status: 403 });
		}
	);

	it.each(['owner', 'admin'] as const)(
		'retains Organization-wide access for %s without leaking foreign rows',
		async (role) => {
			const f = fixture({ ...member, role });
			const ctx = await buildRouteContext(event(f.locals));
			expect(ctx.auth.scopeSet).toEqual({ kind: 'organization' });
			expect(ctx.auth.capabilityMap.training).toBe('configure');
			expect((await ctx.store.findMany<{ id: string }>('personnel', ORG)).map((row) => row.id)).toEqual([
				'person-a',
				'person-b',
				'person-c',
				'ungrouped'
			]);
		}
	);

	it('admits an in-scope write with canonical Organization identity through a slug', async () => {
		const f = fixture();
		const response = await write(event(f.locals, 'alpha'));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 'created', group_id: 'group-b', organization_id: ORG });
		expect(f.tables.personnel.at(-1)).toEqual({ id: 'created', group_id: 'group-b', organization_id: ORG });
	});

	it('rejects anonymous requests even with a seeded membership and never reads or writes provider data', async () => {
		const f = fixture();
		f.locals.user = null;
		cacheRequestMembership(f.locals, null, ORG, { role: 'owner' });
		const before = structuredClone(f.tables);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 401 });
		await expect(buildLayoutContext(f.locals, {} as never, ORG)).rejects.toMatchObject({ status: 401 });
		await expect(buildLayoutContextFromMembership(f.locals, {} as never, ORG, member)).rejects.toMatchObject({
			status: 401
		});
		expect(f.fetch).not.toHaveBeenCalled();
		expect(f.tables).toEqual(before);
	});

	it.each(['no membership', 'other user only', 'other Organization only'] as const)(
		'denies %s without a protected mutation',
		async (scenario) => {
			const f = fixture();
			f.tables.organization_memberships =
				scenario === 'no membership'
					? []
					: f.tables.organization_memberships.filter((row) =>
							scenario === 'other user only' ? row.user_id === OTHER_USER : row.organization_id === OTHER_ORG
						);
			const before = structuredClone(f.tables.personnel);
			await expect(write(event(f.locals))).rejects.toMatchObject({ status: 403 });
			await expect(
				loadWithContext(f.locals, {} as never, ORG, {
					policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
					fn: async (ctx) => ctx.store.findMany('personnel', ctx.auth.orgId)
				})
			).rejects.toMatchObject({ status: 403 });
			expect(f.tables.personnel).toEqual(before);
		}
	);

	it.each(['capability', 'Group scope'] as const)('denies an authenticated write outside its %s', async (denial) => {
		const f = fixture(
			denial === 'capability'
				? { ...member, capability_overrides: { personnel: 'view' } }
				: { ...member, access_scope_group_ids: ['group-a'] }
		);
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 403 });
		expect(f.tables.personnel).toEqual(before);
	});

	it('fails closed on membership provider errors and retries successfully in the same request', async () => {
		const f = fixture();
		f.state.failedTable = 'organization_memberships';
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 403 });
		expect(f.tables.personnel).toEqual(before);
		f.state.failedTable = '';
		expect((await write(event(f.locals))).status).toBe(200);
		expect(f.state.membershipReads).toBe(2);
		expect(f.tables.personnel.at(-1)?.id).toBe('created');
	});

	it('denies unavailable or unknown Organization slugs before a mutation', async () => {
		const f = fixture();
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(f.locals, 'missing'))).rejects.toMatchObject({ status: 404 });
		f.state.failedTable = 'organizations';
		await expect(write(event(f.locals, 'alpha'))).rejects.toMatchObject({ status: 500 });
		expect(f.tables.personnel).toEqual(before);
	});

	it('rejects malformed stored member access before a mutation', async () => {
		const f = fixture({ ...member, member_preset: null });
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 500 });
		expect(f.tables.personnel).toEqual(before);
	});

	it('shares the prefetched layout membership with a later route consumer', async () => {
		const f = fixture();
		await buildLayoutContextFromMembership(f.locals, {} as never, ORG, member);
		const ctx = await buildRouteContext(event(f.locals));
		expect(ctx.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(ctx.auth.capabilityMap.training).toBe('none');
		expect(f.state.membershipReads).toBe(0);
	});

	it('shares one membership snapshot across concurrent route/layout and slug/UUID consumers', async () => {
		const f = fixture();
		const [route, layout] = await Promise.all([
			buildRouteContext(event(f.locals)),
			buildLayoutContext(f.locals, {} as never, 'alpha')
		]);
		expect(f.state.membershipReads).toBe(1);
		expect(route.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(layout.auth.scopeSet).toEqual(route.auth.scopeSet);
	});

	it('does not reuse an owner grant across users or Organizations within request locals', async () => {
		const f = fixture();
		await buildLayoutContext(f.locals, {} as never, OTHER_ORG);
		f.locals.user = { id: OTHER_USER } as App.Locals['user'];
		await buildRouteContext(event(f.locals));
		f.locals.user = { id: USER } as App.Locals['user'];
		const ctx = await buildLayoutContext(f.locals, {} as never, ORG);
		expect(ctx.auth.role).toBe('member');
		expect(ctx.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(f.state.membershipReads).toBe(3);
	});

	it('does not carry a cached grant into a new request after membership revocation', async () => {
		const f = fixture();
		await buildRouteContext(event(f.locals));
		f.tables.organization_memberships = [];
		const nextLocals = { user: f.locals.user, supabase: f.locals.supabase, session: null } as App.Locals;
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(nextLocals))).rejects.toMatchObject({ status: 403 });
		expect(f.tables.personnel).toEqual(before);
	});
});
