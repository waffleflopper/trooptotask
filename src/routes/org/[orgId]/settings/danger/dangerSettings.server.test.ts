import { describe, expect, it } from 'vitest';
import { buildDangerSettings } from './dangerSettings.server';

const organization = {
	id: 'org-1',
	name: 'Test Org',
	urlSlug: 'test-org',
	urlSegment: 'test-org'
};

describe('danger settings section', () => {
	it('composes owned transfer candidates with delete confirmation facts', () => {
		const dangerSettings = buildDangerSettings({
			currentMemberRole: 'owner',
			canManageMembers: true,
			isAdmin: false,
			organization,
			transferOwnershipCandidates: [
				{ id: 'admin-membership', userId: 'admin-user', email: 'admin@example.com', membershipRole: 'admin' }
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
});
