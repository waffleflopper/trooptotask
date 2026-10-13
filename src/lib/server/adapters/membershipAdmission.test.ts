import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { OrganizationMembershipFacts } from '$lib/access/memberAccessProjection';
import { getOrLoadRequestMembership } from '$lib/access/index.server';
import {
	buildLayoutRequest,
	buildRouteRequest,
	createRequestPersonnelRecordContext,
	getAdmittedRequestClient
} from './requestContexts.server';
import { createSupabasePersonnelRecordPersistence } from '$features/personnel/index.server';
import { handle, loadWithContext } from './httpAdapter';
import { _createTrainingReportsPageLoad } from '../../../routes/org/[orgId]/training/reports/+page.server';

const { adminClient } = vi.hoisted(() => ({ adminClient: vi.fn() }));
vi.mock('$lib/server/supabase', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/supabase')>()),
	getAdminClient: adminClient
}));
const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';
const member: OrganizationMembershipFacts = {
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
function fixture(membership: OrganizationMembershipFacts = member) {
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
	const state: {
		failedTable: string;
		membershipReads: number;
		membershipGate?: Promise<void>;
		membershipStarted?: () => void;
	} = { failedTable: '', membershipReads: 0 };
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		expect(url.origin).toBe('http://membership.invalid');
		const table = url.pathname.split('/').at(-1)!;
		if (!(table in tables)) throw new Error(`Unexpected provider table: ${table}`);
		if (table === 'organization_memberships') {
			state.membershipReads++;
			state.membershipStarted?.();
			await state.membershipGate;
		}
		if (table === state.failedTable) {
			return Response.json({ code: 'XX000', message: 'synthetic provider failure' }, { status: 500 });
		}
		if (init?.method === 'POST') {
			const row = { ...JSON.parse(String(init.body)), id: 'created' };
			tables[table].push(row);
			return Response.json(row, { status: 201 });
		}
		expect(init?.method ?? 'GET').toBe('GET');
		let rows = tables[table].filter((row) =>
			[...url.searchParams].every(([key, filter]) => {
				if (['select', 'offset', 'limit', 'order'].includes(key)) return true;
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
	const locals = { actor: { userId: USER }, user: { id: USER }, supabase, session: null } as App.Locals;
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
	context: createRequestPersonnelRecordContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
	policyResource: { kind: 'group', groupId: 'group-b' },
	mutation: true,
	fn: async (ctx) =>
		ctx.personnel.create({
			rank: 'SGT',
			firstName: 'Jamie',
			lastName: 'Smith',
			clinicRole: '',
			slug: 'smith-jamie',
			groupId: 'group-b'
		})
});

afterEach(() => vi.restoreAllMocks());

describe('request membership admission through real request construction', () => {
	it.each(['route', 'layout'] as const)(
		'keeps both Groups and independent lane overrides in the %s request',
		async (path) => {
			const f = fixture();
			const ctx = path === 'route' ? await buildRouteRequest(event(f.locals)) : await buildLayoutRequest(f.locals, ORG);
			expect(ctx.auth).toEqual({
				userId: USER,
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'operate',
					onboarding: 'operate',
					ratingScheme: 'configure'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] }
			});
			const visible = await createSupabasePersonnelRecordPersistence(
				f.locals.supabase,
				ctx.auth.orgId,
				ctx.auth.scopeSet
			).listArchiveCandidates(['person-a', 'person-b', 'person-c', 'ungrouped', 'foreign-person']);
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
			const ctx = await buildRouteRequest(event(f.locals));
			expect(ctx.auth.scopeSet).toEqual({ kind: 'organization' });
			expect(ctx.auth.capabilityMap.training).toBe('configure');
			expect(
				(
					await createSupabasePersonnelRecordPersistence(
						f.locals.supabase,
						ctx.auth.orgId,
						ctx.auth.scopeSet
					).listArchiveCandidates(['person-a', 'person-b', 'person-c', 'ungrouped', 'foreign-person'])
				).map((row) => row.id)
			).toEqual(['person-a', 'person-b', 'person-c', 'ungrouped']);
		}
	);

	it('uses the admitted actor rather than an unrelated provider user to load membership', async () => {
		const f = fixture();
		f.locals.user = { id: OTHER_USER } as App.Locals['user'];
		expect(getAdmittedRequestClient(f.locals)).toEqual({ supabase: f.locals.supabase, userId: USER });
		const request = await buildRouteRequest(event(f.locals));
		expect(request.auth.userId).toBe(USER);
		expect(request.auth.role).toBe('member');
		expect(request.auth.isPrivileged).toBe(false);
	});

	it('admits an in-scope write with canonical Organization identity through a slug', async () => {
		const f = fixture();
		const response = await write(event(f.locals, 'alpha'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ id: 'created', groupId: 'group-b' });
		expect(f.tables.personnel.at(-1)).toMatchObject({ id: 'created', group_id: 'group-b', organization_id: ORG });
	});

	it('rejects anonymous requests despite a prior membership read and never reads or writes provider data', async () => {
		const f = fixture();
		await buildLayoutRequest(f.locals, ORG);
		f.fetch.mockClear();
		f.locals.user = null;
		f.locals.actor = null;
		const before = structuredClone(f.tables);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 401 });
		await expect(buildLayoutRequest(f.locals, ORG)).rejects.toMatchObject({ status: 401 });
		expect(() => getAdmittedRequestClient(f.locals)).toThrow(expect.objectContaining({ status: 401 }));
		expect(f.fetch).not.toHaveBeenCalled();
		expect(f.tables).toEqual(before);
	});

	it('denies provider identity without application admission before any membership read or effect', async () => {
		const f = fixture();
		await buildLayoutRequest(f.locals, ORG);
		f.fetch.mockClear();
		f.locals.actor = null;
		const before = structuredClone(f.tables);
		await expect(write(event(f.locals))).rejects.toMatchObject({ status: 401 });
		await expect(buildLayoutRequest(f.locals, ORG)).rejects.toMatchObject({ status: 401 });
		expect(() => getAdmittedRequestClient(f.locals)).toThrow(expect.objectContaining({ status: 401 }));
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
			await expect(write(event(f.locals))).rejects.toMatchObject({
				status: 403,
				body: { message: 'Not a member of this organization' }
			});
			await expect(
				loadWithContext(f.locals, {} as never, ORG, {
					context: createRequestPersonnelRecordContext,
					policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
					fn: async (ctx) => ctx.auth.orgId
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
		await expect(write(event(f.locals))).rejects.toMatchObject({
			status: 403
		});
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
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(write(event(f.locals, 'alpha'))).rejects.toMatchObject({
			status: 503,
			body: { message: 'Unable to verify Organization status' }
		});
		expect(f.tables.personnel).toEqual(before);
	});

	it('rejects malformed stored member access before a mutation', async () => {
		const f = fixture({ ...member, member_preset: null });
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(f.locals))).rejects.toMatchObject({
			status: 500,
			body: { message: 'Membership row is missing normalized member access storage' }
		});
		expect(f.tables.personnel).toEqual(before);
	});

	it('evaluates a stable grant and rejects malformed cached facts when constructing a later request', async () => {
		const f = fixture();
		const request = await buildLayoutRequest(f.locals, ORG);
		const cachedFacts = await getOrLoadRequestMembership(f.locals, USER, ORG, async () => {
			throw new Error('The fetched membership must be reused within this request');
		});
		cachedFacts.capability_overrides = { personnel: 'none' };
		cachedFacts.access_scope_group_ids = ['group-c'];
		cachedFacts.member_preset = null;
		expect(request.auth.capabilityMap.personnel).toBe('configure');
		expect(request.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		const before = structuredClone(f.tables.personnel);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(write(event(f.locals))).rejects.toMatchObject({
			status: 500,
			body: { message: 'Internal server error' }
		});
		expect(f.tables.personnel).toEqual(before);
		expect(f.state.membershipReads).toBe(1);
	});

	it('shares a fetched layout membership with a later route consumer', async () => {
		const f = fixture();
		await buildLayoutRequest(f.locals, ORG);
		const ctx = await buildRouteRequest(event(f.locals));
		expect(ctx.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(ctx.auth.capabilityMap.training).toBe('none');
		expect(f.state.membershipReads).toBe(1);
	});

	it('shares one membership snapshot across concurrent route/layout and slug/UUID consumers', async () => {
		const f = fixture();
		let release!: () => void;
		f.state.membershipGate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			f.state.membershipStarted = resolve;
		});
		const requests = Promise.all([buildRouteRequest(event(f.locals)), buildLayoutRequest(f.locals, 'alpha')]);
		await started;
		release();
		const [route, layout] = await requests;
		expect(f.state.membershipReads).toBe(1);
		expect(route.auth).toMatchObject({ orgId: ORG, scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] } });
		expect(layout.auth).toMatchObject({ orgId: ORG, scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] } });
	});

	it('does not reuse an owner grant across users or Organizations within request locals', async () => {
		const f = fixture();
		await buildLayoutRequest(f.locals, OTHER_ORG);
		f.locals.actor = { userId: OTHER_USER };
		f.locals.user = { id: OTHER_USER } as App.Locals['user'];
		await buildRouteRequest(event(f.locals));
		f.locals.actor = { userId: USER };
		f.locals.user = { id: USER } as App.Locals['user'];
		const ctx = await buildLayoutRequest(f.locals, ORG);
		expect(ctx.auth.role).toBe('member');
		expect(ctx.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(f.state.membershipReads).toBe(3);
	});

	it('does not carry a cached grant into a new request after membership revocation', async () => {
		const f = fixture();
		await buildRouteRequest(event(f.locals));
		f.tables.organization_memberships = [];
		const nextLocals = {
			actor: f.locals.actor,
			user: f.locals.user,
			supabase: f.locals.supabase,
			session: null
		} as App.Locals;
		const before = structuredClone(f.tables.personnel);
		await expect(write(event(nextLocals))).rejects.toMatchObject({ status: 403 });
		expect(f.tables.personnel).toEqual(before);
	});
});

describe('Organization page data admission', () => {
	const report = { rows: [{ personnelId: 'person-a', status: 'current' }] };
	const trainingReportsLoad = _createTrainingReportsPageLoad({
		fetchTrainingBriefingReport: async () => report as never
	});
	const pageEvent = (locals: App.Locals, orgId: string) =>
		({
			params: { orgId },
			url: new URL(`http://app.invalid/org/${orgId}/training/reports/__data.json`),
			locals,
			cookies: {},
			depends: () => {}
		}) as never;

	it.each(['alpha', ORG])('withholds a suspended Organization report addressed as %s', async (segment) => {
		const f = fixture({ ...member, role: 'owner' });
		expect(await trainingReportsLoad(pageEvent(f.locals, segment))).toEqual({ trainingReport: report });
		const suspended = fixture({ ...member, role: 'owner' });
		suspended.tables.organizations[0].suspended_at = '2026-09-01T00:00:00Z';
		await expect(trainingReportsLoad(pageEvent(suspended.locals, segment))).rejects.toMatchObject({
			status: 403,
			body: { message: 'Organization is suspended' }
		});
		await expect(buildLayoutRequest(suspended.locals, segment)).rejects.toMatchObject({ status: 403 });
		expect(suspended.state.membershipReads).toBe(0);
	});

	it('reads Organization status once for the shell and every page load in a request', async () => {
		const f = fixture();
		await Promise.all([buildLayoutRequest(f.locals, 'alpha'), buildLayoutRequest(f.locals, 'alpha')]);
		await buildLayoutRequest(f.locals, 'alpha');
		const organizationReads = f.fetch.mock.calls.filter(([input]) => String(input).includes('/organizations?'));
		expect(organizationReads).toHaveLength(1);
	});

	it.each([
		['unavailable', 503, 'Unable to verify Organization status'],
		['missing', 404, 'Organization not found']
	] as const)('denies a page load when Organization status is %s', async (kind, status, message) => {
		const f = fixture();
		if (kind === 'missing') f.tables.organizations = [];
		else f.state.failedTable = 'organizations';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(buildLayoutRequest(f.locals, ORG)).rejects.toMatchObject({ status, body: { message } });
		expect(f.state.membershipReads).toBe(0);
	});
});
