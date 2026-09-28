import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseOrganizationCreationPort } from './provisioningProvider.server';

function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createSupabaseOrganizationCreationPort({ supabase } as never);
}

describe('Organization creation provider boundary', () => {
	it.each([
		['created', 200, 'org-created', { orgId: 'org-created', errorMessage: null }],
		[
			'owner denied',
			403,
			{ code: '42501', message: 'Owner insert denied' },
			{ orgId: null, errorMessage: 'Owner insert denied' }
		],
		['missing result', 200, null, { orgId: null, errorMessage: null }]
	] as const)('maps %s through the authenticated owner-creation RPC', async (_, status, body, expected) => {
		const requests: Array<{ path: string; method: string; body: unknown }> = [];
		const port = httpPort(async (request) => {
			requests.push({ path: new URL(request.url).pathname, method: request.method, body: await request.json() });
			return Response.json(body, { status });
		});
		expect(await port.createOrganizationWithOwner('Alpha Company')).toEqual(expected);
		// The RPC derives ownership from the authenticated session, never a supplied actor.
		expect(requests).toEqual([
			{ path: '/rest/v1/rpc/create_org_with_owner', method: 'POST', body: { p_name: 'Alpha Company' } }
		]);
	});

	it('updates only the requested owner membership, preserving another actor and another Organization', async () => {
		const memberships = [
			{ organization_id: 'org-1', user_id: 'user-1', email: 'old@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		];
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(request.method).toBe('PATCH');
			const patch = await request.json();
			for (const row of memberships) {
				const matches = [...url.searchParams].every(([key, value]) => row[key as keyof typeof row] === value.slice(3));
				if (matches) Object.assign(row, patch);
			}
			return new Response(null, { status: 204 });
		});
		expect(
			await port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' })
		).toBeNull();
		expect(memberships).toEqual([
			{ organization_id: 'org-1', user_id: 'user-1', email: 'owner@example.test' },
			{ organization_id: 'org-1', user_id: 'user-2', email: 'member@example.test' },
			{ organization_id: 'org-2', user_id: 'user-1', email: 'sibling@example.test' }
		]);
	});

	it('reports a denied owner email update without broadening the target', async () => {
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(url.searchParams.get('organization_id')).toBe('eq.org-1');
			expect(url.searchParams.get('user_id')).toBe('eq.user-1');
			expect(await request.json()).toEqual({ email: 'owner@example.test' });
			return Response.json({ code: '42501', message: 'Write denied' }, { status: 403 });
		});
		expect(
			await port.updateOwnerMembershipEmail({ organizationId: 'org-1', userId: 'user-1', email: 'owner@example.test' })
		).toBe('Write denied');
	});
});
