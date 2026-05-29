import { describe, expect, it, vi } from 'vitest';
import { buildDangerSettings, loadDangerSettings } from './dangerSettings.server';

const organization = {
	id: 'org-1',
	name: 'Test Org',
	urlSlug: 'test-org',
	urlSegment: 'test-org',
	effectiveTier: null
};

describe('danger settings section', () => {
	it('builds owner-only transfer candidates and delete confirmation facts', () => {
		const dangerSettings = buildDangerSettings({
			currentMemberRole: 'owner',
			canManageMembers: true,
			isAdmin: false,
			organization,
			members: [
				{ id: 'owner-membership', user_id: 'owner-user', email: 'owner@example.com', role: 'owner' },
				{ id: 'admin-membership', user_id: 'admin-user', email: 'admin@example.com', role: 'admin' },
				{ id: 'pending-membership', user_id: null, email: 'pending@example.com', role: 'member' }
			]
		});

		expect(dangerSettings.currentMember).toMatchObject({ role: 'owner', isOwner: true });
		expect(dangerSettings.sections.organization.name).toBe('Test Org');
		expect(dangerSettings.sections.dangerZone).toEqual({
			transferOwnershipCandidates: [
				{
					id: 'admin-membership',
					userId: 'admin-user',
					email: 'admin@example.com',
					membershipRole: 'admin'
				}
			],
			deleteConfirmation: {
				organizationName: 'Test Org',
				normalizedOrganizationName: 'Test Org'
			},
			commands: {
				canTransferOwnership: true,
				canDeleteOrganization: true
			}
		});
	});

	it('does not query transfer candidates when the current member is not owner', async () => {
		const findMany = vi.fn();
		const dangerSettings = await loadDangerSettings(
			{
				auth: { orgId: 'org-1', role: 'admin', canManageMembers: true },
				store: { findMany }
			} as never,
			{ isAdmin: true, organization }
		);

		expect(findMany).not.toHaveBeenCalled();
		expect(dangerSettings.currentMember.isOwner).toBe(false);
		expect(dangerSettings.sections.dangerZone.transferOwnershipCandidates).toEqual([]);
		expect(dangerSettings.sections.dangerZone.commands).toEqual({
			canTransferOwnership: false,
			canDeleteOrganization: false
		});
	});
});
