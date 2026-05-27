import { describe, expect, it } from 'vitest';
import { deriveMembershipFromInvitation, isAdminInvitation } from './organizationInvitationMembership';

describe('organizationInvitationMembership', () => {
	it('derives admin invitation membership from Membership Role with fixed admin access', () => {
		const invitation = {
			organizationId: 'org-1',
			role: 'admin' as const,
			memberPreset: 'viewer' as const,
			capabilityOverrides: { calendar: 'none' as const },
			accessScopeKind: 'groups' as const,
			accessScopeGroupIds: ['group-alpha']
		};

		expect(isAdminInvitation(invitation)).toBe(true);
		expect(
			deriveMembershipFromInvitation({
				invitation,
				userId: 'user-1',
				email: 'user@example.com'
			})
		).toEqual({
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'user@example.com',
			role: 'admin',
			memberPreset: 'editor',
			capabilityOverrides: {},
			accessScopeKind: 'organization',
			accessScopeGroupIds: []
		});
	});

	it('carries replacement member access from invitation to membership', () => {
		const membership = deriveMembershipFromInvitation({
			invitation: {
				organizationId: 'org-1',
				role: 'member',
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['group-alpha', 'group-bravo']
			},
			userId: 'user-1',
			email: 'user@example.com'
		});

		expect(membership).toEqual({
			organizationId: 'org-1',
			userId: 'user-1',
			email: 'user@example.com',
			role: 'member',
			memberPreset: 'operator',
			capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['group-alpha', 'group-bravo']
		});
	});

	it('defaults missing replacement member access to editor organization scope', () => {
		expect(
			deriveMembershipFromInvitation({
				invitation: {
					organizationId: 'org-1',
					role: 'member'
				},
				userId: 'user-1',
				email: 'user@example.com'
			})
		).toMatchObject({
			role: 'member',
			memberPreset: 'editor',
			capabilityOverrides: {},
			accessScopeKind: 'organization',
			accessScopeGroupIds: []
		});
	});
});
