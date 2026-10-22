import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
const actorId = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const organization = { id: orgId, name: 'Able Clinic', suspended_at: null, created_at: '2026-06-01T00:00:00.000Z' };
let role: string | null;
let count: number;
let candidates: boolean;
let failingSource: 'ledger' | 'activation' | null;
let reads: URL[];

function event(path = '/admin/organizations', authenticated = true): Parameters<typeof load>[0] {
	const url = new URL(path, 'http://localhost:9');
	return {
		locals: { actor: authenticated ? { userId: actorId } : null, user: { id: 'untrusted-other-user' } },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	role = 'super_admin';
	count = 0;
	candidates = false;
	failingSource = null;
	reads = [];
	getAdminClient.mockReturnValue(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					reads.push(url);
					const table = url.pathname.split('/').at(-1);
					if (table === 'platform_admins') {
						expect(url.searchParams.get('user_id')).toBe(`eq.${actorId}`);
						expect(url.searchParams.get('is_active')).toBe('eq.true');
						return Response.json(role ? { role } : null);
					}
					if (table === 'organizations') {
						const isLedger = url.searchParams.has('offset');
						if ((isLedger && failingSource === 'ledger') || (!isLedger && failingSource === 'activation'))
							return Response.json({ message: 'private provider detail' }, { status: 500 });
						const offset = Number(url.searchParams.get('offset') ?? 0);
						if (isLedger && offset > 0 && offset >= count)
							return Response.json(
								{ code: 'PGRST103', message: 'Requested range not satisfiable', details: null, hint: null },
								{ status: 416, headers: { 'Content-Range': `*/${count}` } }
							);
						if (isLedger && url.searchParams.get('select') === 'id')
							return new Response(null, { headers: { 'Content-Range': `*/${count}` } });
						return Response.json((isLedger ? count > 0 : candidates) ? [organization] : [], {
							headers: { 'Content-Range': `0-0/${count}` }
						});
					}
					if (table === 'count_personnel_by_organization')
						return Response.json([{ organization_id: orgId, personnel_count: 3 }]);
					if (table === 'count_memberships_by_organization')
						return Response.json([{ organization_id: orgId, membership_count: 1 }]);
					if (table === 'list_platform_owner_membership_metrics')
						return Response.json([{ organization_id: orgId, owner_count: 0, owner_user_id: null, owner_email: null }]);
					if (table === 'rating_scheme_entries') {
						expect(url.searchParams.get('organization_id')).toContain(orgId);
						return Response.json([
							{ id: 'eval-1', organization_id: orgId },
							{ id: 'eval-2', organization_id: orgId }
						]);
					}
					return Response.json([]);
				}
			}
		})
	);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('Organization index admitted source composition', () => {
	it('loads the requested page with search and suspension filters', async () => {
		count = 101;
		const result = await load(event('/admin/organizations?page=3&pageSize=50&q=Able&status=active'));
		expect(result).toMatchObject({
			pagination: { page: 3, pageSize: 50, totalCount: 101, totalPages: 3, q: 'Able', status: 'active' },
			organizations: [{ id: orgId, memberCount: 1, personnelCount: 3 }],
			activationHealth: { overallState: 'no_candidates' }
		});
		const query = reads.find((url) => url.pathname.endsWith('/organizations') && url.searchParams.has('offset'))!;
		expect(query.searchParams.get('offset')).toBe('100');
		expect(query.searchParams.get('limit')).toBe('50');
		expect(query.searchParams.get('name')).toBe('ilike.%Able%');
		expect(query.searchParams.get('suspended_at')).toBe('is.null');
	});
	it('shows the last page of a filtered directory instead of an error when the requested page is past the end', async () => {
		count = 30;
		const result = await load(event('/admin/organizations?q=Able&page=9'));
		expect(result).toMatchObject({ pagination: { page: 2, pageSize: 25, totalCount: 30, totalPages: 2, q: 'Able' } });
		count = 0;
		await expect(load(event('/admin/organizations?q=zzz&page=2'))).resolves.toMatchObject({
			organizations: [],
			pagination: { page: 1, totalCount: 0, totalPages: 1, q: 'zzz' }
		});
	});
	it('includes saved Rating configuration through the actual owning reader', async () => {
		count = 1;
		candidates = true;
		const result = await load(event());
		expect(result).toMatchObject({
			activationHealth: {
				counts: { setupStarted: 1 },
				organizations: [{ supportBundle: { activation: { ratingSchemeEntries: 2 } } }]
			}
		});
	});
	it.each([null, 'billing'])('denies current role %s before protected reads', async (currentRole) => {
		role = currentRole;
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
		expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/platform_admins']);
	});
	it('redirects a missing verified actor before any provider read', async () => {
		await expect(load(event('/admin/organizations', false))).rejects.toMatchObject({
			status: 303,
			location: '/auth/login'
		});
		expect(reads).toEqual([]);
	});
	it('allows current Support to read the index', async () => {
		role = 'support';
		await expect(load(event())).resolves.toMatchObject({ organizations: [], pagination: { totalCount: 0 } });
	});
	it('sanitizes an unavailable primary ledger', async () => {
		failingSource = 'ledger';
		await expect(load(event())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to load platform organizations.' }
		});
	});
	it('keeps the ledger available while reporting unavailable activation diagnostics', async () => {
		count = 1;
		failingSource = 'activation';
		await expect(load(event())).resolves.toMatchObject({
			organizations: [{ id: orgId }],
			activationHealth: { overallState: 'diagnostics_unavailable', diagnosticsError: true }
		});
	});
});
