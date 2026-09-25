import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from './hooks.server';
import { POST as createGroup } from './routes/org/[orgId]/api/groups/+server';
import {
	GET as listLeaderNotes,
	POST as createLeaderNote
} from './routes/org/[orgId]/api/personnel/[id]/leader-notes/+server';
import { PATCH as updateLeaderNote } from './routes/org/[orgId]/api/personnel/[id]/leader-notes/[noteId]/+server';
import { createRootOrgLayoutLoad } from '$lib/server/core/useCases/createRootOrgLayoutLoad';
import { requireReadyAppShell } from '$lib/server/core/appShellRouteData';
import { buildLayoutContext } from '$lib/server/adapters/httpAdapter';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';

const { serverClient, adminClient } = vi.hoisted(() => ({ serverClient: vi.fn(), adminClient: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: serverClient }));
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://organization.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-key'
}));
vi.mock('$lib/server/env', () => ({}));
vi.mock('$lib/server/supabase', async (original) => ({
	...(await original<typeof import('$lib/server/supabase')>()),
	getAdminClient: adminClient
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';
const SUSPENDED_AT = '2026-09-01T00:00:00Z';
type Row = Record<string, unknown>;

function fixture() {
	const tables: Record<string, Row[]> = {
		organizations: [
			{ id: ORG, name: 'Alpha', url_slug: 'alpha', suspended_at: null },
			{ id: OTHER_ORG, name: 'Bravo', url_slug: 'bravo', suspended_at: SUSPENDED_AT }
		],
		organization_memberships: [
			{
				id: 'membership-a',
				user_id: USER,
				organization_id: ORG,
				role: 'member',
				member_preset: 'editor',
				capability_overrides: { training: 'none', ratingScheme: 'operate' },
				access_scope_kind: 'groups',
				access_scope_group_ids: ['group-a', 'group-b']
			},
			{ id: 'other-user', user_id: OTHER_USER, organization_id: ORG, role: 'owner' },
			{ id: 'other-org', user_id: USER, organization_id: OTHER_ORG, role: 'owner' }
		],
		groups: [],
		personnel: [{ id: 'person-a', organization_id: ORG, group_id: 'group-a' }],
		leader_notes: [
			{
				id: 'note-a',
				organization_id: ORG,
				personnel_id: 'person-a',
				author: USER,
				text: 'Range preparation complete',
				created_at: '2026-09-20T10:00:00Z',
				archived_at: null
			}
		],
		audit_logs: [],
		platform_announcements: [],
		announcement_dismissals: [],
		user_org_preferences: []
	};
	const state = { failedTable: '', membershipReads: 0, organizationReads: 0 };
	// Real SDK, synthetic transport; filters apply to independent rows, with no simulated RLS.
	const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		expect(url.origin).toBe('http://organization.invalid');
		const table = url.pathname.split('/').at(-1)!;
		if (!(table in tables)) throw new Error(`Unexpected table ${table}`);
		if (table === 'organization_memberships') state.membershipReads++;
		if (table === 'organizations') state.organizationReads++;
		if (table === state.failedTable)
			return Response.json({ code: 'XX000', message: 'private provider detail' }, { status: 500 });
		if (init?.method === 'POST') {
			const row = { id: 'created-group', ...JSON.parse(String(init.body)) };
			tables[table].push(row);
			return Response.json(row, { status: 201 });
		}
		expect(init?.method ?? 'GET').toBe('GET');
		let rows = tables[table].filter((row) =>
			[...url.searchParams].every(([key, filter]) => {
				if (['select', 'offset', 'limit', 'order'].includes(key)) return true;
				if (table === 'platform_announcements' && key === 'or') return true; // Empty optional chrome fixture.
				if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
				if (filter === 'is.null') return row[key] == null;
				if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').includes(String(row[key]));
				throw new Error(`Unexpected filter ${key}=${filter}`);
			})
		);
		const select = url.searchParams.get('select');
		if (select && select !== '*')
			rows = rows.map((row) => Object.fromEntries(select.split(',').map((key) => [key, row[key]])));
		if (new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')) {
			return rows.length === 1 ? Response.json(rows[0]) : Response.json({ code: 'PGRST116' }, { status: 406 });
		}
		return Response.json(rows);
	});
	const provider = createClient('http://organization.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: transport }
	});
	const now = new Date().toISOString();
	const user = {
		id: USER,
		aud: 'authenticated',
		email: 'member@example.test',
		app_metadata: {},
		user_metadata: {},
		created_at: now,
		last_sign_in_at: now
	};
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const accessToken = `${encode({ alg: 'HS256' })}.${encode({
		sub: USER,
		session_id: '00000000-0000-4000-8000-000000000001',
		amr: [{ method: 'password' }]
	})}.synthetic`;
	const client = {
		from: provider.from.bind(provider),
		rpc: vi.fn((name: string) =>
			name === 'get_current_session_started_at'
				? { setHeader: () => Promise.resolve({ data: now, error: null }) }
				: Promise.resolve({ data: false, error: null })
		),
		auth: {
			getSession: vi.fn().mockResolvedValue({
				data: {
					session: {
						user,
						access_token: accessToken,
						refresh_token: 'synthetic-refresh'
					}
				},
				error: null
			}),
			getClaims: vi.fn().mockResolvedValue({
				data: { claims: { sub: USER, aud: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {} } },
				error: null
			}),
			getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: vi
					.fn()
					.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
			}
		}
	};
	serverClient.mockReturnValue(client);
	adminClient.mockReturnValue(provider);
	const locals = { actor: { userId: USER }, user, supabase: client, session: null } as unknown as App.Locals;
	function event(segment = 'alpha', method = 'POST', suffix = '/api/groups'): RequestEvent {
		const url = new URL(`http://app.invalid/org/${segment}${suffix}`);
		return {
			url,
			params: { orgId: segment },
			route: { id: suffix.startsWith('/api/') ? '/org/[orgId]/api/groups' : '/org/[orgId]/calendar' },
			locals,
			request: new Request(url, {
				method,
				...(method === 'GET' || method === 'HEAD'
					? {}
					: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New Group' }) })
			}),
			cookies: {
				getAll: () => [{ name: 'sb-organization-auth-token', value: 'synthetic' }],
				get: () => undefined,
				set: vi.fn(),
				delete: vi.fn()
			},
			getClientAddress: () => '127.0.0.1'
		} as unknown as RequestEvent;
	}
	const dispatch = vi.fn(async (event: RequestEvent) => createGroup!(event));
	const load = (request = event('alpha', 'GET', '/calendar')) =>
		createRootOrgLayoutLoad()({
			...request,
			params: { orgId: request.params.orgId! },
			depends: vi.fn()
		});
	return { tables, state, client, locals, event, dispatch, load, transport };
}

afterEach(() => vi.restoreAllMocks());

describe('Organization request suspension admission', () => {
	it.each(['alpha', ORG])(
		'denies a direct Group creation in a suspended Organization addressed as %s',
		async (segment) => {
			const f = fixture();
			f.tables.organizations[0].suspended_at = SUSPENDED_AT;
			// Group creation is an Organization-wide governance operation.
			f.tables.organization_memberships[0].role = 'owner';
			await expect(handle({ event: f.event(segment), resolve: f.dispatch })).rejects.toMatchObject({ status: 403 });
			expect(f.tables.groups).toEqual([]);
			expect(f.dispatch).not.toHaveBeenCalled();
		}
	);
});

describe('Organization admission denial and recovery', () => {
	it('admits the current leader-note GET and blocks it before dispatch when status is unsafe', async () => {
		const f = fixture();
		f.tables.organization_memberships[0].display_name = '1SG Alvarez';
		const noteEvent = () => {
			const request = f.event('alpha', 'GET', '/api/personnel/person-a/leader-notes');
			request.params.id = 'person-a';
			request.route = { id: '/org/[orgId]/api/personnel/[id]/leader-notes' };
			return request;
		};
		const dispatch = vi.fn(async (event: RequestEvent) => listLeaderNotes!(event));
		const response = await handle({ event: noteEvent(), resolve: dispatch });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([
			expect.objectContaining({
				id: 'note-a',
				personnelId: 'person-a',
				author: '1SG Alvarez',
				text: 'Range preparation complete'
			})
		]);
		f.tables.organizations[0].suspended_at = SUSPENDED_AT;
		await expect(handle({ event: noteEvent(), resolve: dispatch })).rejects.toMatchObject({ status: 403 });
		f.tables.organizations[0].suspended_at = null;
		f.state.failedTable = 'organizations';
		await expect(handle({ event: noteEvent(), resolve: dispatch })).rejects.toMatchObject({ status: 503 });
		f.state.failedTable = '';
		f.tables.organizations = [];
		await expect(handle({ event: noteEvent(), resolve: dispatch })).rejects.toMatchObject({ status: 404 });
		expect(dispatch).toHaveBeenCalledTimes(1);
	});

	it.each(['POST', 'PATCH'] as const)('preserves the current %s malformed-JSON response', async (method) => {
		const f = fixture();
		const suffix = `/api/personnel/person-a/leader-notes${method === 'PATCH' ? '/note-a' : ''}`;
		const request = f.event('alpha', method, suffix);
		request.params.id = 'person-a';
		if (method === 'PATCH') request.params.noteId = 'note-a';
		request.route = {
			id:
				method === 'PATCH'
					? '/org/[orgId]/api/personnel/[id]/leader-notes/[noteId]'
					: '/org/[orgId]/api/personnel/[id]/leader-notes'
		};
		request.request = new Request(request.url, { method, body: '{' });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			handle({
				event: request,
				resolve: (event) => (method === 'PATCH' ? updateLeaderNote!(event) : createLeaderNote!(event))
			})
		).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
		expect(f.tables.leader_notes).toHaveLength(1);
	});
	it.each(['owner', 'admin'])(
		'allows an active %s to create a Group while another Organization is suspended',
		async (role) => {
			const f = fixture();
			f.tables.organization_memberships[0].role = role;
			const response = await handle({ event: f.event(), resolve: f.dispatch });
			expect(response.status).toBe(200);
			expect(f.tables.groups).toEqual([
				{ id: 'created-group', organization_id: ORG, name: 'New Group', sort_order: 0 }
			]);
		}
	);

	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('denies %s page actions before any route side effect', async (method) => {
		const f = fixture();
		f.tables.organizations[0].suspended_at = SUSPENDED_AT;
		const effects: string[] = [];
		const resolve = async () => {
			effects.push('mutation');
			return new Response('ok');
		};
		await expect(handle({ event: f.event('alpha', method, '/settings/members'), resolve })).rejects.toMatchObject({
			status: 403
		});
		expect(effects).toEqual([]);
	});

	it.each(['GET', 'HEAD'])(
		'denies %s API requests, including private reads and export side effects',
		async (method) => {
			const f = fixture();
			f.tables.organizations[0].suspended_at = SUSPENDED_AT;
			const resolve = vi.fn(async () => new Response('private records'));
			await expect(
				handle({ event: f.event('alpha', method, '/api/personnel/person-a/export'), resolve })
			).rejects.toMatchObject({ status: 403 });
			expect(resolve).not.toHaveBeenCalled();
		}
	);

	it('still dispatches page GETs to the suspended shell', async () => {
		const f = fixture();
		f.tables.organizations[0].suspended_at = SUSPENDED_AT;
		const response = await handle({
			event: f.event('alpha', 'GET', '/calendar'),
			resolve: async (event) => Response.json(await f.load(event))
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ shell: { kind: 'suspended', state: { orgSuspended: true } } });
	});

	it('rechecks suspension on every write and resumes after unsuspension without changing membership', async () => {
		const f = fixture();
		f.tables.organization_memberships[0].role = 'owner';
		const original = structuredClone(f.tables.organization_memberships);
		expect((await handle({ event: f.event(), resolve: f.dispatch })).status).toBe(200);
		f.tables.organizations[0].suspended_at = SUSPENDED_AT;
		await expect(handle({ event: f.event(), resolve: f.dispatch })).rejects.toMatchObject({ status: 403 });
		expect(f.tables.groups).toHaveLength(1);
		f.tables.organizations[0].suspended_at = null;
		expect((await handle({ event: f.event(), resolve: f.dispatch })).status).toBe(200);
		expect(f.tables.groups).toHaveLength(2);
		expect(f.tables.organization_memberships).toEqual(original);
	});

	it('denies unavailable status without leaking provider detail and permits retry', async () => {
		const f = fixture();
		f.tables.organization_memberships[0].role = 'owner';
		f.state.failedTable = 'organizations';
		await expect(handle({ event: f.event(ORG), resolve: f.dispatch })).rejects.toMatchObject({
			status: 503,
			body: { message: 'Unable to verify Organization status' }
		});
		expect(f.dispatch).not.toHaveBeenCalled();
		expect(f.tables.groups).toEqual([]);
		f.state.failedTable = '';
		expect((await handle({ event: f.event(ORG), resolve: f.dispatch })).status).toBe(200);
	});

	it.each([undefined, false, 0, ''])('denies malformed suspension status %s', async (value) => {
		const f = fixture();
		f.tables.organizations[0].suspended_at = value;
		await expect(handle({ event: f.event(), resolve: f.dispatch })).rejects.toMatchObject({ status: 503 });
		expect(f.dispatch).not.toHaveBeenCalled();
		expect(f.tables.groups).toEqual([]);
	});

	it('denies an Organization hidden by the user-scoped provider', async () => {
		const f = fixture();
		f.tables.organizations = [];
		await expect(handle({ event: f.event(), resolve: f.dispatch })).rejects.toMatchObject({ status: 404 });
		expect(f.dispatch).not.toHaveBeenCalled();
		expect(f.tables.groups).toEqual([]);
	});

	it('does not grant membership merely because the Organization is active', async () => {
		const f = fixture();
		f.tables.organization_memberships = [];
		await expect(handle({ event: f.event(), resolve: f.dispatch })).rejects.toMatchObject({ status: 403 });
		expect(f.tables.groups).toEqual([]);
	});

	it('requires authentication before Organization lookup', async () => {
		const f = fixture();
		const event = f.event();
		event.cookies.getAll = () => [];
		await expect(handle({ event, resolve: f.dispatch })).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(f.state.organizationReads).toBe(0);
		expect(f.tables.groups).toEqual([]);
	});

	it('keeps account and platform recovery paths outside Organization suspension', async () => {
		const f = fixture();
		f.state.failedTable = 'organizations';
		for (const path of ['/account', '/admin/api/suspend'] as const) {
			const event = f.event();
			event.params = {};
			event.route = { id: path };
			event.url = new URL(`http://app.invalid${path}`);
			event.request = new Request(event.url, { method: 'POST' });
			const response = await handle({ event, resolve: async () => new Response('dispatched') });
			expect(response.status).toBe(200);
		}
		expect(f.state.organizationReads).toBe(0);
	});
});

describe('Organization shell admission with real provider mapping', () => {
	it('preserves first-paint identity, independent lanes and both Groups and shares membership with child contexts', async () => {
		const f = fixture();
		const result = await f.load();
		expect(requireReadyAppShell(result)).toMatchObject({
			org: { id: ORG, name: 'Alpha', urlSegment: 'alpha' },
			user: { id: USER },
			member: {
				membershipId: 'membership-a',
				role: 'member',
				capabilityMap: { personnel: 'configure', training: 'none', ratingScheme: 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['group-a', 'group-b'] }
			},
			state: { orgSuspended: false }
		});
		const child = await buildLayoutContext(f.locals, {} as never, ORG);
		expect(child.auth.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
		expect(f.state.membershipReads).toBe(1);
	});

	it.each(['no membership', 'wrong user', 'wrong Organization'] as const)(
		'rejects a ready shell with %s',
		async (kind) => {
			const f = fixture();
			f.tables.organization_memberships = f.tables.organization_memberships.filter((row) =>
				kind === 'wrong user'
					? row.user_id === OTHER_USER
					: kind === 'wrong Organization'
						? row.organization_id === OTHER_ORG
						: false
			);
			await expect(f.load()).rejects.toMatchObject({ status: 403 });
		}
	);

	it('denies an anonymous shell before reading provider data', async () => {
		const f = fixture();
		f.locals.user = null;
		f.locals.actor = null;
		await expect(f.load()).rejects.toMatchObject({ status: 401 });
		expect(f.transport).not.toHaveBeenCalled();
	});

	it('denies provider membership failure without exposing details and retries on the same request', async () => {
		const f = fixture();
		f.state.failedTable = 'organization_memberships';
		await expect(f.load()).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
		f.state.failedTable = '';
		expect((await f.load()).shell.kind).toBe('ready');
		expect(f.state.membershipReads).toBe(2);
	});

	it.each(['missing', 'unavailable'] as const)('denies a %s Organization lookup', async (kind) => {
		const f = fixture();
		if (kind === 'missing') f.tables.organizations = [];
		else f.state.failedTable = 'organizations';
		await expect(f.load()).rejects.toMatchObject({ status: kind === 'missing' ? 404 : 500 });
	});

	it('canonicalizes a UUID URL while preserving the route and query', async () => {
		const f = fixture();
		await expect(f.load(f.event(ORG, 'GET', '/calendar?date=2026-09-17'))).rejects.toMatchObject({
			status: 308,
			location: '/org/alpha/calendar?date=2026-09-17'
		});
	});

	it('retains the suspended shell without ready access and denies child consumers', async () => {
		const f = fixture();
		f.tables.organizations[0].suspended_at = SUSPENDED_AT;
		const result = await f.load();
		expect(result).toEqual({
			shell: {
				kind: 'suspended',
				org: { id: ORG, name: 'Alpha', urlSegment: 'alpha' },
				state: { orgSuspended: true }
			}
		});
		expect(() => requireReadyAppShell(result)).toThrow(expect.objectContaining({ status: 403 }));
		expect(f.state.membershipReads).toBe(0);
		expect(f.tables.groups).toEqual([]);
	});

	it.each(['platform_announcements', 'user_org_preferences'])(
		'keeps ready access when optional %s fails',
		async (table) => {
			const f = fixture();
			f.state.failedTable = table;
			const shell = requireReadyAppShell(await f.load());
			expect(shell.member.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-a', 'group-b'] });
			expect(shell.announcements).toEqual([]);
			expect(shell.preferences).toEqual(getDefaultUserOrgPreferences());
		}
	);
});
