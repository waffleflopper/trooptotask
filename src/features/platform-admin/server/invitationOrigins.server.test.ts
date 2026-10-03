import { describe, expect, it } from 'vitest';
import type { OrganizationSupportInvitationOriginFact } from '$features/organization/contracts';
import { shapeAccessRequestInvitationOrigins } from './invitationOrigins.server';

const USER = '11111111-1111-4111-8111-111111111111';
function origin(
	overrides: Partial<OrganizationSupportInvitationOriginFact> = {}
): OrganizationSupportInvitationOriginFact {
	return {
		id: 'link-1',
		organization_invitation_id: 'invite-1',
		organization_id: 'org-1',
		invited_by: USER,
		invited_at: '2026-05-18T13:00:00Z',
		intended_membership_role: 'member',
		intended_member_preset: 'viewer',
		organizations: { id: 'org-1', name: 'Alpha Company' },
		...overrides
	};
}

describe('Platform invitation origin projection', () => {
	it('retains unknown inviter and Organization context when optional labels are missing', () => {
		expect(shapeAccessRequestInvitationOrigins([origin({ organizations: null })], new Map())).toEqual([
			expect.objectContaining({
				inviter_email: null,
				inviter_label: 'Unknown inviter',
				organization_name: 'Unknown organization',
				membership_role: 'member',
				member_preset: 'viewer',
				intended_access_label: 'Member preset: Viewer'
			})
		]);
	});
	it('prefers a trimmed profile name over account email and otherwise uses the known email', () => {
		expect(
			shapeAccessRequestInvitationOrigins(
				[origin()],
				new Map([[USER, { email: 'leader@example.test', firstName: ' Avery ', lastName: 'Jones' }]])
			)
		).toEqual([expect.objectContaining({ inviter_email: 'leader@example.test', inviter_label: 'Avery Jones' })]);
		expect(
			shapeAccessRequestInvitationOrigins(
				[origin()],
				new Map([[USER, { email: 'leader@example.test', firstName: ' ', lastName: null }]])
			)
		).toEqual([expect.objectContaining({ inviter_label: 'leader@example.test' })]);
	});
	it('orders origins newest first and reports admin access without a member preset', () => {
		const older = origin();
		const newer = origin({
			id: 'link-2',
			invited_at: '2026-05-20T13:00:00Z',
			intended_membership_role: 'admin',
			intended_member_preset: 'viewer'
		});
		expect(shapeAccessRequestInvitationOrigins([older, newer], new Map())).toEqual([
			expect.objectContaining({
				link_id: 'link-2',
				membership_role: 'admin',
				member_preset: null,
				intended_access_label: 'Membership Role: Admin'
			}),
			expect.objectContaining({ link_id: 'link-1', membership_role: 'member', member_preset: 'viewer' })
		]);
	});
});
