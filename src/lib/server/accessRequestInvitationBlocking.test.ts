import { describe, expect, it, vi } from 'vitest';
import { rejectAccessRequestAndBlockLinkedInvitations } from './accessRequestInvitationBlocking';

describe('access request invitation blocking', () => {
	it('rejects an access request and returns linked invitations blocked by the database transition', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						reject_status: 'rejected',
						organization_invitation_id: 'invite-1',
						organization_id: 'org-1',
						invitation_email: 'invitee@example.com',
						blocked_at: '2026-05-22T12:00:00.000Z'
					}
				],
				error: null
			})
		};

		const result = await rejectAccessRequestAndBlockLinkedInvitations(supabase as never, {
			accessRequestId: 'request-1',
			reviewerId: 'admin-1'
		});

		expect(result).toEqual({
			status: 'rejected',
			blockedInvitations: [
				{
					id: 'invite-1',
					organizationId: 'org-1',
					email: 'invitee@example.com',
					blockedAt: '2026-05-22T12:00:00.000Z'
				}
			]
		});
		expect(supabase.rpc).toHaveBeenCalledWith('reject_access_request_and_block_linked_invitations', {
			p_access_request_id: 'request-1',
			p_reviewer_id: 'admin-1'
		});
	});

	it('preserves every blocked invitation returned by the transition', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						reject_status: 'rejected',
						organization_invitation_id: 'invite-1',
						organization_id: 'org-1',
						invitation_email: 'one@example.com',
						blocked_at: '2026-05-22T12:00:00.000Z'
					},
					{
						reject_status: 'rejected',
						organization_invitation_id: 'invite-2',
						organization_id: 'org-2',
						invitation_email: 'two@example.com',
						blocked_at: '2026-05-22T12:01:00.000Z'
					}
				],
				error: null
			})
		};

		await expect(
			rejectAccessRequestAndBlockLinkedInvitations(supabase as never, {
				accessRequestId: 'request-1',
				reviewerId: 'admin-1'
			})
		).resolves.toEqual({
			status: 'rejected',
			blockedInvitations: [
				{
					id: 'invite-1',
					organizationId: 'org-1',
					email: 'one@example.com',
					blockedAt: '2026-05-22T12:00:00.000Z'
				},
				{
					id: 'invite-2',
					organizationId: 'org-2',
					email: 'two@example.com',
					blockedAt: '2026-05-22T12:01:00.000Z'
				}
			]
		});
	});

	it('keeps ordinary access request rejection successful when no invitations were linked', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						reject_status: 'rejected',
						organization_invitation_id: null,
						organization_id: null,
						invitation_email: null,
						blocked_at: null
					}
				],
				error: null
			})
		};

		await expect(
			rejectAccessRequestAndBlockLinkedInvitations(supabase as never, {
				accessRequestId: 'request-1',
				reviewerId: 'admin-1'
			})
		).resolves.toEqual({ status: 'rejected', blockedInvitations: [] });
	});

	it('distinguishes already-reviewed requests from provider failures', async () => {
		const notFoundSupabase = {
			rpc: vi.fn().mockResolvedValue({
				data: [{ reject_status: 'not_found' }],
				error: null
			})
		};
		const failedSupabase = {
			rpc: vi.fn().mockResolvedValue({
				data: null,
				error: { message: 'rpc unavailable' }
			})
		};

		await expect(
			rejectAccessRequestAndBlockLinkedInvitations(notFoundSupabase as never, {
				accessRequestId: 'request-1',
				reviewerId: 'admin-1'
			})
		).resolves.toEqual({ status: 'not_found', blockedInvitations: [] });
		await expect(
			rejectAccessRequestAndBlockLinkedInvitations(failedSupabase as never, {
				accessRequestId: 'request-1',
				reviewerId: 'admin-1'
			})
		).resolves.toEqual({
			status: 'failed',
			message: 'rpc unavailable',
			blockedInvitations: []
		});
	});

	it('fails closed when the rejection transition returns an unexpected payload', async () => {
		const supabase = {
			rpc: vi.fn().mockResolvedValue({
				data: [],
				error: null
			})
		};

		await expect(
			rejectAccessRequestAndBlockLinkedInvitations(supabase as never, {
				accessRequestId: 'request-1',
				reviewerId: 'admin-1'
			})
		).resolves.toEqual({
			status: 'failed',
			message: 'Access request rejection returned an unexpected result',
			blockedInvitations: []
		});
	});
});
