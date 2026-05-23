/* eslint-disable @typescript-eslint/no-explicit-any -- mock Supabase clients need any casts */
import { describe, expect, it, vi } from 'vitest';
import { autoAcceptOrgInvites } from './auto-accept-org-invites';

function createMockSupabase(invitations: Array<{ id: string }> = [], rpcStatuses: Record<string, string | null> = {}) {
	const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

	const mock = {
		from: vi.fn((table: string) => {
			if (table !== 'organization_invitations') return {};
			return {
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							range: vi.fn().mockResolvedValue({ data: invitations, error: null })
						})
					})
				})
			};
		}),
		rpc: vi.fn((fn: string, args: { p_invitation_id: string }) => {
			rpcCalls.push({ fn, args });
			return {
				single: vi.fn().mockResolvedValue({
					data: {
						accept_status: rpcStatuses[args.p_invitation_id] ?? 'accepted',
						accepted_organization_id: 'org-1'
					},
					error: null
				})
			};
		}),
		_rpcCalls: rpcCalls
	};

	return mock;
}

describe('autoAcceptOrgInvites', () => {
	it('returns accepted: 0 when no pending invitations exist', async () => {
		const supabase = createMockSupabase([]);

		const result = await autoAcceptOrgInvites(supabase as any, 'test@example.com');

		expect(result).toEqual({ accepted: 0 });
		expect(supabase.rpc).not.toHaveBeenCalled();
	});

	it('accepts pending invitations through the hardened invitation RPC', async () => {
		const supabase = createMockSupabase([{ id: 'invite-1' }, { id: 'invite-2' }]);

		const result = await autoAcceptOrgInvites(supabase as any, ' TEST@Example.com ');

		expect(result).toEqual({ accepted: 2 });
		expect(supabase.from).toHaveBeenCalledWith('organization_invitations');
		expect(supabase._rpcCalls).toEqual([
			{ fn: 'accept_organization_invitation', args: { p_invitation_id: 'invite-1' } },
			{ fn: 'accept_organization_invitation', args: { p_invitation_id: 'invite-2' } }
		]);
	});

	it('does not count expired, blocked, setup-gated, or already-member invitations as accepted', async () => {
		const supabase = createMockSupabase(
			[{ id: 'accepted' }, { id: 'expired' }, { id: 'blocked' }, { id: 'setup-required' }, { id: 'already-member' }],
			{
				accepted: 'accepted',
				expired: 'expired',
				blocked: 'blocked',
				'setup-required': 'setup_required',
				'already-member': 'already_member'
			}
		);

		const result = await autoAcceptOrgInvites(supabase as any, 'test@example.com');

		expect(result).toEqual({ accepted: 1 });
		expect(supabase.rpc).toHaveBeenCalledTimes(5);
	});
});
