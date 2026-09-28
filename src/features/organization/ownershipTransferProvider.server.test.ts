import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseOrganizationOwnershipTransferPort } from './ownershipTransferProvider.server';

function httpPort(handle: (request: Request) => Promise<Response>) {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
	return createSupabaseOrganizationOwnershipTransferPort({ supabase } as never);
}

describe('Organization ownership-transfer provider boundary', () => {
	it('looks up the target only within the requested Organization and by user ID', async () => {
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(request.method).toBe('GET');
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(url.searchParams.get('select')).toBe('user_id,email,role');
			expect(url.searchParams.get('organization_id')).toBe('eq.org-1');
			expect(url.searchParams.get('user_id')).toBe('eq.user-2');
			return Response.json({ user_id: 'user-2', email: 'member@example.test', role: 'member' });
		});

		expect(await port.findOwnershipTransferTarget('org-1', 'user-2')).toEqual({
			userId: 'user-2',
			email: 'member@example.test',
			role: 'member'
		});
	});

	it('keeps the request-user RPC parameters and maps provider denial', async () => {
		const port = httpPort(async (request) => {
			expect(request.method).toBe('POST');
			expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/transfer_org_ownership');
			expect(await request.json()).toEqual({ p_organization_id: 'org-1', p_new_owner_id: 'user-2' });
			return Response.json({ code: '42501', message: 'Only the owner can transfer ownership' }, { status: 403 });
		});

		expect(await port.transferOwnership('org-1', 'user-2')).toBe('Only the owner can transfer ownership');
	});

	it('returns no provider error after a successful owner transfer RPC', async () => {
		const port = httpPort(async (request) => {
			expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/transfer_org_ownership');
			return new Response(null, { status: 204 });
		});

		expect(await port.transferOwnership('org-1', 'user-2')).toBeNull();
	});

	it('retains organization name readback after the RPC, including a failed-read fallback', async () => {
		const port = httpPort(async (request) => {
			const url = new URL(request.url);
			expect(url.pathname).toBe('/rest/v1/organizations');
			expect(url.searchParams.get('select')).toBe('name');
			expect(url.searchParams.get('id')).toBe('eq.org-1');
			return Response.json({ code: '42501', message: 'Name unavailable' }, { status: 403 });
		});

		expect(await port.lookupOrganization('org-1')).toEqual({ name: null, errorMessage: 'Name unavailable' });
	});
});
