import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
const actorId = '10000000-0000-4000-8000-000000000001';
const orgId = '20000000-0000-4000-8000-000000000001';
const organization = { id: orgId, name: 'Able Clinic', suspended_at: null, created_at: '2026-06-01T00:00:00.000Z' };
let operator: boolean;
let assurance: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' };
let count: number;
let ledgerFails: boolean;
let reads: URL[];

function event(path = '/admin/organizations', authenticated = true): Parameters<typeof load>[0] {
	const url = new URL(path, 'http://localhost:9');
	return {
		locals: {
			actor: authenticated ? { userId: actorId } : null,
			user: { id: 'untrusted-other-user' },
			supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: assurance, error: null }) } } },
			session: null
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	operator = true;
	assurance = { currentLevel: 'aal2', nextLevel: 'aal2' };
	count = 0;
	ledgerFails = false;
	reads = [];
	getAdminClient.mockReturnValue(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					reads.push(url);
					const table = url.pathname.split('/').at(-1);
					if (table === 'platform_operators') {
						expect(url.searchParams.get('user_id')).toBe(`eq.${actorId}`);
						return Response.json(operator ? { user_id: actorId } : null);
					}
					if (table === 'organizations') {
						if (ledgerFails) return Response.json({ message: 'private provider detail' }, { status: 500 });
						const offset = Number(url.searchParams.get('offset') ?? 0);
						if (offset > 0 && offset >= count)
							return Response.json(
								{ code: 'PGRST103', message: 'Requested range not satisfiable', details: null, hint: null },
								{ status: 416, headers: { 'Content-Range': `*/${count}` } }
							);
						if (url.searchParams.get('select') === 'id')
							return new Response(null, { headers: { 'Content-Range': `*/${count}` } });
						return Response.json(count > 0 ? [organization] : [], {
							headers: { 'Content-Range': `0-0/${count}` }
						});
					}
					if (table === 'count_personnel_by_organization')
						return Response.json([{ organization_id: orgId, personnel_count: 3 }]);
					if (table === 'count_memberships_by_organization')
						return Response.json([{ organization_id: orgId, membership_count: 1 }]);
					if (table === 'list_platform_owner_membership_metrics')
						return Response.json([{ organization_id: orgId, owner_count: 0, owner_user_id: null, owner_email: null }]);
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
			organizations: [{ id: orgId, memberCount: 1, personnelCount: 3 }]
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
	it('denies a non-operator before protected reads', async () => {
		operator = false;
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
		expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/platform_operators']);
	});
	it('sends an operator at aal1 to MFA enrollment before protected reads', async () => {
		assurance = { currentLevel: 'aal1', nextLevel: 'aal1' };
		await expect(load(event())).rejects.toMatchObject({
			status: 303,
			location: '/auth/mfa-setup?next=%2Fadmin%2Forganizations'
		});
		expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/platform_operators']);
	});
	it('refuses a missing verified actor before any provider read', async () => {
		await expect(load(event('/admin/organizations', false))).rejects.toMatchObject({ status: 403 });
		expect(reads).toEqual([]);
	});
	it('sanitizes an unavailable primary ledger', async () => {
		ledgerFails = true;
		await expect(load(event())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to load platform organizations.' }
		});
	});
});
