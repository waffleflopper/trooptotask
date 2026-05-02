import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { PERMISSION_PRESETS, type OrganizationMemberPermissions } from '$lib/types';
import {
	inviteOrganizationMember,
	removeOrganizationMember,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions,
	type OrganizationInvitationCreateInput,
	type OrganizationMembershipUpdateInput,
	type OrganizationSettingsMemberManagementPort
} from './orgSettingsMemberManagement';

function buildPermissions(overrides: Partial<OrganizationMemberPermissions> = {}): OrganizationMemberPermissions {
	return {
		...PERMISSION_PRESETS['full-editor'],
		...overrides
	};
}

function createOrganizationSettingsMemberManagementPort(
	options: {
		existingInvitationId?: string | null;
		createInvitationError?: string | null;
		revokeInvitationError?: string | null;
		membership?: {
			userId: string | null;
			role: string | null;
			email: string | null;
		} | null;
		removeMembershipError?: string | null;
		updateMembershipError?: string | null;
		orgName?: string | null;
	} = {}
): OrganizationSettingsMemberManagementPort & {
	invitationLookups: Array<{ orgId: string; email: string }>;
	createdInvitations: OrganizationInvitationCreateInput[];
	revokedInvitations: Array<{ orgId: string; inviteId: string }>;
	membershipLookups: Array<{ orgId: string; membershipId: string }>;
	removedMemberships: Array<{ orgId: string; membershipId: string }>;
	updatedMemberships: OrganizationMembershipUpdateInput[];
} {
	const invitationLookups: Array<{ orgId: string; email: string }> = [];
	const createdInvitations: OrganizationInvitationCreateInput[] = [];
	const revokedInvitations: Array<{ orgId: string; inviteId: string }> = [];
	const membershipLookups: Array<{ orgId: string; membershipId: string }> = [];
	const removedMemberships: Array<{ orgId: string; membershipId: string }> = [];
	const updatedMemberships: OrganizationMembershipUpdateInput[] = [];

	return {
		invitationLookups,
		createdInvitations,
		revokedInvitations,
		membershipLookups,
		removedMemberships,
		updatedMemberships,
		async findPendingInvitation(orgId, email) {
			invitationLookups.push({ orgId, email });
			return options.existingInvitationId ? { id: options.existingInvitationId } : null;
		},
		async createInvitation(input) {
			createdInvitations.push(input);
			return options.createInvitationError ?? null;
		},
		async revokeInvitation(orgId, inviteId) {
			revokedInvitations.push({ orgId, inviteId });
			return options.revokeInvitationError ?? null;
		},
		async findMembershipById(orgId, membershipId) {
			membershipLookups.push({ orgId, membershipId });
			return options.membership ?? null;
		},
		async removeMembership(orgId, membershipId) {
			removedMemberships.push({ orgId, membershipId });
			return options.removeMembershipError ?? null;
		},
		async updateMembership(input) {
			updatedMemberships.push(input);
			return options.updateMembershipError ?? null;
		},
		async getOrganizationName() {
			return options.orgName ?? null;
		}
	};
}

describe('inviteOrganizationMember', () => {
	it('denies admin invitations in read-only mode with policy audit metadata', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			},
			readOnly: true
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: port
				},
				{
					email: 'new.user@example.com',
					preset: 'full-editor',
					scopedGroupId: null,
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});

		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.inviteMember',
					reasonCode: 'denied:read-only-overlay',
					blockingOverlay: 'read-only-mode'
				},
				severity: 'warning'
			}
		]);
	});

	it('denies high-access members who are not admin or owner before creating invitations', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'new.user@example.com',
					preset: 'full-editor',
					scopedGroupId: null,
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.invitationLookups).toEqual([]);
		expect(port.createdInvitations).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.inviteMember',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects invalid invitation emails before querying pending invites', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort();

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'not-an-email',
					preset: 'full-editor',
					scopedGroupId: null,
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Please enter a valid email address'
		});

		expect(port.invitationLookups).toEqual([]);
	});

	it('preserves the duplicate pending invite failure for the normalized email address', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({ existingInvitationId: 'invite-1' });

		await expect(
			inviteOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					email: 'USER@EXAMPLE.COM ',
					preset: 'full-editor',
					scopedGroupId: null,
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'An invitation for this email is already pending'
		});

		expect(port.invitationLookups).toEqual([{ orgId: 'test-org', email: 'user@example.com' }]);
		expect(port.createdInvitations).toEqual([]);
	});

	it('creates the invitation with preset permissions, logs the audit event, and notifies admins', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await inviteOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				email: 'NEW.USER@EXAMPLE.COM',
				preset: 'team-leader',
				scopedGroupId: 'group-1',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({
			inviteSuccess: true,
			inviteEmail: 'new.user@example.com',
			inviteMessage:
				'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
		});
		expect(port.createdInvitations).toEqual([
			{
				organizationId: 'org-1',
				email: 'new.user@example.com',
				invitedBy: 'actor-1',
				scopedGroupId: 'group-1',
				permissions: PERMISSION_PRESETS['team-leader'],
				memberPreset: 'operator',
				capabilityOverrides: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['group-1']
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.invite',
				resourceType: 'organization',
				details: { email: 'new.user@example.com' }
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'actor-1',
				notification: {
					type: 'member_invited',
					title: 'Member Invited',
					message: '"actor@example.com" invited "new.user@example.com" to the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});
});

describe('revokeOrganizationInvitation', () => {
	it('revokes the invite through the settings boundary and records the audit event', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await revokeOrganizationInvitation(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{ inviteId: '11111111-1111-4111-8111-111111111111' }
		);

		expect(result).toEqual({ success: true });
		expect(port.revokedInvitations).toEqual([{ orgId: 'org-1', inviteId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.invite_revoked',
				resourceType: 'organization',
				details: { inviteId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
	});

	it('fails when invitation revocation returns a provider error', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			revokeInvitationError: 'Failed to revoke invitation'
		});

		await expect(
			revokeOrganizationInvitation(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{ inviteId: '11111111-1111-4111-8111-111111111111' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to revoke invitation'
		});
	});
});

describe('removeOrganizationMember', () => {
	it('denies high-access members who are not admin or owner before removing memberships', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.membershipLookups).toEqual([]);
		expect(port.removedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.removeMember',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('rejects removing the current actor from the organization', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'actor-1',
				role: 'member',
				email: 'actor@example.com'
			}
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'You cannot remove yourself from the organization'
		});

		expect(port.removedMemberships).toEqual([]);
	});

	it('removes the membership, audits it, and sends the existing notifications', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			},
			orgName: 'Alpha Company'
		});

		const result = await removeOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(port.removedMemberships).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.removed',
				resourceType: 'organization',
				details: { membershipId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_removed',
					title: 'Removed from Organization',
					message: 'You have been removed from "Alpha Company".'
				}
			},
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'actor-1',
				notification: {
					type: 'member_removed',
					title: 'Member Removed',
					message: '"actor@example.com" removed "member@example.com" from the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('preserves the current missing-membership success path without sending notifications', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort();

		const result = await removeOrganizationMember(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ success: true });
		expect(port.removedMemberships).toEqual([
			{ orgId: 'test-org', membershipId: '11111111-1111-4111-8111-111111111111' }
		]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.removed',
				resourceType: 'organization',
				details: { membershipId: '11111111-1111-4111-8111-111111111111' }
			}
		]);
	});

	it('fails when membership removal returns a provider error', async () => {
		const ctx = createTestContext();
		const port = createOrganizationSettingsMemberManagementPort({
			removeMembershipError: 'Failed to remove member'
		});

		await expect(
			removeOrganizationMember(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to remove member'
		});
	});
});

describe('updateOrganizationMemberPermissions', () => {
	it('denies admins before granting another member admin access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin',
				requireOwner: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'admin',
					scopedGroupId: null,
					customPermissions: buildPermissions(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'Only the organization owner can perform this action'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateAdminAccess',
					reasonCode: 'denied:owner-only'
				},
				severity: 'warning'
			}
		]);
	});

	it('denies high-access members who are not admin or owner before updating access', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'member',
				requireManageMembers: vi.fn()
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'full-editor',
					scopedGroupId: null,
					customPermissions: buildPermissions(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires an organization admin or owner role'
		});

		expect(port.updatedMemberships).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'policy.denied',
				resourceType: 'organization',
				details: {
					policyAction: 'organization.updateMemberAccess',
					reasonCode: 'denied:governance-role'
				},
				severity: 'warning'
			}
		]);
	});

	it('blocks owner permission changes before auth escalation checks', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'owner-1',
				role: 'owner',
				email: 'owner@example.com'
			}
		});

		await expect(
			updateOrganizationMemberPermissions(
				{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
				{
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'admin',
					scopedGroupId: null,
					customPermissions: buildPermissions(),
					actorEmail: 'actor@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Cannot modify owner permissions'
		});

		expect(requireOwner).not.toHaveBeenCalled();
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([]);
	});

	it('requires owner rights for admin changes, updates the membership, and sends the role-change notification', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: null
			},
			orgName: 'Alpha Company'
		});

		const result = await updateOrganizationMemberPermissions(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				preset: 'admin',
				scopedGroupId: null,
				customPermissions: buildPermissions(),
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(port.membershipLookups).toEqual([{ orgId: 'org-1', membershipId: '11111111-1111-4111-8111-111111111111' }]);
		expect(requireOwner).not.toHaveBeenCalled();
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'admin',
				scopedGroupId: null,
				permissions: PERMISSION_PRESETS.admin,
				memberPreset: 'editor',
				capabilityOverrides: {},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.permissions_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'admin'
				},
				severity: 'warning'
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_role_changed',
					title: 'Role Updated',
					message: 'Your role in "Alpha Company" has been changed to admin.'
				}
			}
		]);
	});

	it('uses governance policy for non-admin updates and keeps the permission-change notification path', async () => {
		const requireOwner = vi.fn();
		const requireManageMembers = vi.fn();
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				requireOwner,
				requireManageMembers
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: null
			},
			orgName: 'Alpha Company'
		});
		const customPermissions = buildPermissions({
			canEditPersonnel: false,
			canManageMembers: false
		});

		const result = await updateOrganizationMemberPermissions(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				preset: 'custom',
				scopedGroupId: null,
				customPermissions,
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(requireManageMembers).not.toHaveBeenCalled();
		expect(requireOwner).not.toHaveBeenCalled();
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
				scopedGroupId: null,
				permissions: customPermissions,
				memberPreset: 'viewer',
				capabilityOverrides: {
					calendar: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				accessScopeKind: 'organization',
				accessScopeGroupIds: []
			}
		]);
		expect(ctx.notificationPort.notifications).toEqual([
			{
				target: 'user',
				orgId: 'org-1',
				userId: 'member-1',
				notification: {
					type: 'member_permissions_changed',
					title: 'Permissions Updated',
					message: 'Your permissions in "Alpha Company" have been updated.'
				}
			}
		]);
		expect(ctx.auditPort.events).toEqual([
			{
				action: 'member.permissions_changed',
				resourceType: 'organization',
				details: {
					membershipId: '11111111-1111-4111-8111-111111111111',
					preset: 'custom'
				},
				severity: 'warning'
			}
		]);
	});

	it('persists target member access presets with explicit lane overrides and multi-group scope', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'actor-1',
				orgId: 'org-1',
				role: 'admin'
			}
		});
		const port = createOrganizationSettingsMemberManagementPort({
			membership: {
				userId: 'member-1',
				role: 'member',
				email: 'member@example.com'
			}
		});

		const result = await updateOrganizationMemberPermissions(
			{ auth: ctx.auth, audit: ctx.audit, notifications: ctx.notifications, settings: port },
			{
				membershipId: '11111111-1111-4111-8111-111111111111',
				preset: 'operator',
				scopedGroupId: null,
				capabilityOverrides: {
					calendar: 'configure',
					ratingScheme: 'none'
				},
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
				actorEmail: 'actor@example.com'
			}
		);

		expect(result).toEqual({ permissionSuccess: true });
		expect(port.updatedMemberships).toEqual([
			{
				organizationId: 'org-1',
				membershipId: '11111111-1111-4111-8111-111111111111',
				role: 'member',
				scopedGroupId: '22222222-2222-4222-8222-222222222222',
				permissions: {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: false,
					canViewTraining: true,
					canEditTraining: false,
					canViewCriticalTasks: true,
					canEditCriticalTasks: false,
					canViewOnboarding: true,
					canEditOnboarding: false,
					canViewRatingScheme: false,
					canEditRatingScheme: false,
					canViewLeadersBook: true,
					canEditLeadersBook: false,
					canManageMembers: false
				},
				memberPreset: 'operator',
				capabilityOverrides: {
					calendar: 'configure',
					ratingScheme: 'none'
				},
				accessScopeKind: 'groups',
				accessScopeGroupIds: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
			}
		]);
	});
});
