import { describe, expect, it, vi } from 'vitest';
import {
	resolveAccessRequestInvitationOrigins,
	type AccessRequestInvitationOriginRow
} from './accessRequestInvitationOrigin';

function makeLink(overrides: Partial<AccessRequestInvitationOriginRow>): AccessRequestInvitationOriginRow {
	return {
		id: 'link-1',
		organization_invitation_id: 'invite-1',
		organization_id: 'org-1',
		invited_by: '11111111-1111-4111-8111-111111111111',
		invited_at: '2026-05-18T13:00:00.000Z',
		intended_membership_role: 'member',
		intended_member_preset: 'viewer',
		organizations: { id: 'org-1', name: 'Alpha Company' },
		...overrides
	};
}

describe('access request invitation origin read model', () => {
	it('falls back to inviter user id when auth lookup is unavailable', async () => {
		const result = await resolveAccessRequestInvitationOrigins(
			[
				{
					id: 'request-1',
					access_request_organization_invitation_links: [makeLink({})]
				}
			],
			undefined
		);

		expect(result['request-1']).toEqual([
			expect.objectContaining({
				inviter_email: null,
				inviter_label: 'User 11111111...'
			})
		]);
	});

	it('keeps rendering fallback context when auth lookup fails', async () => {
		const getUserById = vi.fn().mockRejectedValue(new Error('auth unavailable'));

		const result = await resolveAccessRequestInvitationOrigins(
			[
				{
					id: 'request-1',
					access_request_organization_invitation_links: [makeLink({})]
				}
			],
			{ getUserById }
		);

		expect(getUserById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
		expect(result['request-1']).toEqual([
			expect.objectContaining({
				organization_name: 'Alpha Company',
				inviter_label: 'User 11111111...'
			})
		]);
	});

	it('sorts multiple invitation origins newest first and shapes admin access context', async () => {
		const result = await resolveAccessRequestInvitationOrigins(
			[
				{
					id: 'request-1',
					access_request_organization_invitation_links: [
						makeLink({
							id: 'older-link',
							organization_invitation_id: 'older-invite',
							invited_at: '2026-05-18T13:00:00.000Z',
							intended_membership_role: 'member',
							intended_member_preset: 'operator'
						}),
						makeLink({
							id: 'newer-link',
							organization_invitation_id: 'newer-invite',
							organization_id: 'org-2',
							invited_at: '2026-05-19T13:00:00.000Z',
							intended_membership_role: 'admin',
							intended_member_preset: null,
							organizations: null
						})
					]
				}
			],
			{
				getUserById: vi.fn().mockResolvedValue({
					data: { user: { email: 'leader@example.mil' } },
					error: null
				})
			}
		);

		expect(result['request-1'].map((origin) => origin.link_id)).toEqual(['newer-link', 'older-link']);
		expect(result['request-1'][0]).toMatchObject({
			organization_name: 'Unknown organization',
			membership_role: 'admin',
			membership_role_label: 'Admin',
			member_preset: null,
			member_preset_label: null,
			intended_access_label: 'Membership Role: Admin'
		});
		expect(result['request-1'][1]).toMatchObject({
			membership_role: 'member',
			member_preset: 'operator',
			member_preset_label: 'Operator',
			intended_access_label: 'Member preset: Operator'
		});
	});
});
