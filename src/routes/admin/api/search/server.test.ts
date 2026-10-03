import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
const actorId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';
const orgId = '30000000-0000-4000-8000-000000000001';
let role: string | null;
let countUnavailable: boolean;
let reads: URL[];
let bodies: Map<string, Record<string, unknown>>;
function event(query = 'Able', authenticated = true): Parameters<typeof GET>[0] {
	const url = new URL('/admin/api/search', 'http://localhost:9');
	url.searchParams.set('q', query);
	return {
		locals: { actor: authenticated ? { userId: actorId } : null, user: { id: 'forged-user' } },
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof GET>[0];
}
beforeEach(() => {
	role = 'support';
	countUnavailable = false;
	reads = [];
	bodies = new Map();
	getAdminClient.mockReturnValue(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					reads.push(url);
					const table = url.pathname.split('/').at(-1)!;
					if (init?.body) bodies.set(table, JSON.parse(String(init.body)));
					switch (table) {
						case 'platform_admins':
							expect(url.searchParams.get('user_id')).toBe(`eq.${actorId}`);
							expect(url.searchParams.get('is_active')).toBe('eq.true');
							return Response.json(role ? { role } : null);
						case 'search_users_by_email':
							return Response.json([{ id: userId, email: 'able@example.test' }]);
						case 'organizations':
							return Response.json([{ id: orgId, name: 'Able Clinic' }]);
						case 'organization_memberships':
							expect(url.searchParams.get('user_id')).toContain(userId);
							return Response.json([{ user_id: userId }, { user_id: userId }]);
						case 'count_personnel_by_organization':
							return countUnavailable
								? Response.json({ message: 'private provider detail' }, { status: 500 })
								: Response.json([{ organization_id: orgId, personnel_count: 3 }]);
						default:
							throw new Error(`Unexpected provider ${table}`);
					}
				}
			}
		})
	);
});
describe('admitted support search source composition', () => {
	it.each(['support', 'super_admin'])(
		'returns correct scoped counts for current %s using batched sources',
		async (currentRole) => {
			role = currentRole;
			const response = await GET(event('Able'));
			expect(await response.json()).toEqual({
				users: [{ id: userId, email: 'able@example.test', orgCount: 2 }],
				organizations: [{ id: orgId, name: 'Able Clinic', personnelCount: 3 }]
			});
			expect(bodies.get('search_users_by_email')).toEqual({ search_query: 'Able', max_results: 5 });
			expect(bodies.get('count_personnel_by_organization')).toEqual({ p_org_ids: [orgId] });
			expect(reads.filter((url) => !url.pathname.endsWith('/platform_admins'))).toHaveLength(4);
		}
	);
	it('does not query source records for a short search', async () => {
		const response = await GET(event('Ab'));
		expect(await response.json()).toEqual({ users: [], organizations: [] });
		expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/platform_admins']);
	});
	it.each([null, 'billing'])('denies current role %s before even an empty search', async (currentRole) => {
		role = currentRole;
		await expect(GET(event(''))).rejects.toMatchObject({ status: 403 });
		expect(reads.map((url) => url.pathname)).toEqual(['/rest/v1/platform_admins']);
	});
	it('redirects a missing verified actor before any provider read', async () => {
		await expect(GET(event('Able', false))).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(reads).toEqual([]);
	});
	it('does not publish zero personnel counts when the source read fails', async () => {
		countUnavailable = true;
		await expect(GET(event())).rejects.toMatchObject({
			status: 500,
			body: { message: 'Unable to search platform records' }
		});
	});
});
