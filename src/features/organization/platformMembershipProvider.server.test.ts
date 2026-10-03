import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseOrganizationPlatformMembershipPort } from './platformMembershipProvider.server';

const actorUserId = 'd2103000-0000-4000-8000-000000000001';
const orgId = 'd2103000-0000-4000-8000-000000000101';
const targetUserId = 'd2103000-0000-4000-8000-000000000006';
const fromUserId = 'd2103000-0000-4000-8000-000000000005';
function port(handler: (request: Request) => Promise<Response>) {
	return createSupabaseOrganizationPlatformMembershipPort(
		createClient('http://127.0.0.1:9', 'synthetic-service', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: (input, init) => handler(new Request(input, init)) }
		})
	);
}

describe('Organization platform membership provider boundary', () => {
	it('uses one actor-bound RPC for transfer, without separate membership mutations', async () => {
		let calls = 0;
		const provider = port(async (request) => {
			calls++;
			expect(request.method).toBe('POST');
			expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/platform_transfer_org_ownership');
			expect(await request.json()).toEqual({
				p_actor_user_id: actorUserId,
				p_organization_id: orgId,
				p_target_user_id: targetUserId,
				p_confirm_name: 'A'
			});
			return Response.json({
				status: 'updated',
				org_id: orgId,
				from_user_id: fromUserId,
				to_user_id: targetUserId,
				org_name: 'A'
			});
		});
		expect(await provider.transferOwnership({ actorUserId, orgId, targetUserId, confirmName: 'A' })).toEqual({
			status: 'updated',
			orgId,
			fromUserId,
			toUserId: targetUserId,
			orgName: 'A'
		});
		expect(calls).toBe(1);
	});
	it.each([
		null,
		[],
		{ status: 'updated' },
		{ status: 'unexpected' },
		{ status: 'updated', org_id: fromUserId, from_user_id: fromUserId, to_user_id: targetUserId, org_name: 'A' },
		{ status: 'updated', org_id: orgId, from_user_id: targetUserId, to_user_id: targetUserId, org_name: 'A' },
		{ status: 'updated', org_id: orgId, from_user_id: fromUserId, to_user_id: fromUserId, org_name: 'A' },
		{ status: 'updated', org_id: orgId, from_user_id: fromUserId, to_user_id: targetUserId, org_name: 'changed' }
	])('rejects an unacknowledged or mismatched transfer response %#', async (body) => {
		const provider = port(async () => Response.json(body));
		expect(await provider.transferOwnership({ actorUserId, orgId, targetUserId, confirmName: 'A' })).toEqual({
			status: 'provider_error'
		});
	});
	it.each(['42501', 'XX000'])('maps provider %s safely without SQL or secret-bearing text', async (code) => {
		const provider = port(async () =>
			Response.json({ code, message: 'private provider detail', details: 'secret' }, { status: 403 })
		);
		expect(await provider.promoteMember({ actorUserId, orgId, targetUserId })).toEqual({
			status: code === '42501' ? 'forbidden' : 'provider_error'
		});
	});
	it('requires an exact promotion acknowledgement and targets only its bound member', async () => {
		const provider = port(async (request) => {
			expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/platform_promote_org_member');
			expect(await request.json()).toEqual({
				p_actor_user_id: actorUserId,
				p_organization_id: orgId,
				p_target_user_id: targetUserId
			});
			return Response.json({ status: 'updated', org_id: orgId, target_user_id: fromUserId });
		});
		expect(await provider.promoteMember({ actorUserId, orgId, targetUserId })).toEqual({ status: 'provider_error' });
	});
	it('returns every member past the provider row cap, with stable ordering and Organization scope', async () => {
		const rows = Array.from({ length: 1001 }, (_, i) => ({
			user_id: `d2103000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
			email: null,
			role: 'member'
		}));
		const offsets: number[] = [];
		const provider = port(async (request) => {
			const url = new URL(request.url);
			const offset = Number(url.searchParams.get('offset'));
			expect(url.pathname).toBe('/rest/v1/organization_memberships');
			expect(url.searchParams.get('organization_id')).toBe(`eq.${orgId}`);
			expect(url.searchParams.get('order')).toBe('role.asc,id.asc');
			offsets.push(offset);
			return Response.json(rows.slice(offset, offset + Number(url.searchParams.get('limit'))));
		});
		const members = await provider.listMembers(orgId);
		expect(members).toHaveLength(1001);
		expect(members[1000].userId).toBe(rows[1000].user_id);
		expect(offsets).toEqual([0, 1000]);
	});
	it('does not turn a failed member page into an empty directory', async () => {
		const provider = port(async () => Response.json({ code: '42501', message: 'private detail' }, { status: 403 }));
		await expect(provider.listMembers(orgId)).rejects.toThrow('Organization members could not be loaded');
	});
	it.each([null, [{ user_id: 'invalid', email: null, role: 'member' }]])(
		'rejects an unavailable or malformed member page %#',
		async (body) => {
			const provider = port(async () => Response.json(body));
			await expect(provider.listMembers(orgId)).rejects.toThrow('Organization members could not be loaded');
		}
	);
});
