import { PERMISSION_PRESETS, type OrganizationMemberPermissions } from '$lib/types';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, AuditPort, NotificationPort } from '$lib/server/core/ports';
import { sanitizeString, validateEmail, validateUUID } from '$lib/server/validation';

export interface OrganizationInvitationCreateInput {
	organizationId: string;
	email: string;
	invitedBy: string;
	scopedGroupId: string | null;
	permissions: OrganizationMemberPermissions;
}

export interface OrganizationMembershipUpdateInput {
	organizationId: string;
	membershipId: string;
	role: 'admin' | 'member';
	scopedGroupId: string | null;
	permissions: OrganizationMemberPermissions;
}

interface OrganizationMembershipRecord {
	userId: string | null;
	role: string | null;
	email: string | null;
}

export interface OrganizationSettingsMemberManagementPort {
	findPendingInvitation(orgId: string, email: string): Promise<{ id: string } | null>;
	createInvitation(input: OrganizationInvitationCreateInput): Promise<string | null>;
	revokeInvitation(orgId: string, inviteId: string): Promise<string | null>;
	findMembershipById(orgId: string, membershipId: string): Promise<OrganizationMembershipRecord | null>;
	removeMembership(orgId: string, membershipId: string): Promise<string | null>;
	updateMembership(input: OrganizationMembershipUpdateInput): Promise<string | null>;
	getOrganizationName(orgId: string): Promise<string | null>;
}

interface OrganizationSettingsMemberManagementPorts {
	auth: AuthContext;
	audit: AuditPort;
	notifications: NotificationPort;
	settings: OrganizationSettingsMemberManagementPort;
}

interface InviteOrganizationMemberInput {
	email: string;
	preset: string;
	scopedGroupId: string | null;
	actorEmail?: string | null;
}

interface RevokeOrganizationInvitationInput {
	inviteId: string;
}

interface RemoveOrganizationMemberInput {
	membershipId: string;
	actorEmail?: string | null;
}

interface UpdateOrganizationMemberPermissionsInput {
	membershipId: string;
	preset: string;
	scopedGroupId: string | null;
	customPermissions?: Partial<OrganizationMemberPermissions> | null;
	actorEmail?: string | null;
}

export async function inviteOrganizationMember(
	ports: OrganizationSettingsMemberManagementPorts,
	input: InviteOrganizationMemberInput
): Promise<{
	inviteSuccess: true;
	inviteEmail: string;
	inviteMessage: string;
}> {
	ports.auth.requireManageMembers();

	const actorUserId = requireActorUserId(ports.auth);
	const email = normalizeEmail(input.email);

	if (!validateEmail(email)) {
		fail(400, 'Please enter a valid email address');
	}

	const existing = await ports.settings.findPendingInvitation(ports.auth.orgId, email);
	if (existing) {
		fail(400, 'An invitation for this email is already pending');
	}

	const permissions = resolvePresetPermissions(input.preset);
	const errorMessage = await ports.settings.createInvitation({
		organizationId: ports.auth.orgId,
		email,
		invitedBy: actorUserId,
		scopedGroupId: input.preset === 'team-leader' ? input.scopedGroupId : null,
		permissions
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.invite',
		resourceType: 'organization',
		details: { email }
	});

	await ports.notifications.notifyAdmins(ports.auth.orgId, actorUserId, {
		type: 'member_invited',
		title: 'Member Invited',
		message: `"${input.actorEmail ?? ''}" invited "${email}" to the organization.`,
		link: `/org/${ports.auth.orgId}/settings`
	});

	return {
		inviteSuccess: true,
		inviteEmail: email,
		inviteMessage:
			'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
	};
}

export async function revokeOrganizationInvitation(
	ports: OrganizationSettingsMemberManagementPorts,
	input: RevokeOrganizationInvitationInput
): Promise<{ success: true }> {
	ports.auth.requireManageMembers();

	if (!validateUUID(input.inviteId)) {
		fail(400, 'Invalid invitation ID');
	}

	const errorMessage = await ports.settings.revokeInvitation(ports.auth.orgId, input.inviteId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.invite_revoked',
		resourceType: 'organization',
		details: { inviteId: input.inviteId }
	});

	return { success: true };
}

export async function removeOrganizationMember(
	ports: OrganizationSettingsMemberManagementPorts,
	input: RemoveOrganizationMemberInput
): Promise<{ success: true }> {
	ports.auth.requireManageMembers();

	if (!validateUUID(input.membershipId)) {
		fail(400, 'Invalid membership ID');
	}

	const actorUserId = requireActorUserId(ports.auth);
	const membership = await ports.settings.findMembershipById(ports.auth.orgId, input.membershipId);

	if (membership?.userId === actorUserId) {
		fail(400, 'You cannot remove yourself from the organization');
	}

	if (membership?.role === 'owner') {
		fail(400, 'Cannot remove the organization owner');
	}

	const errorMessage = await ports.settings.removeMembership(ports.auth.orgId, input.membershipId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.removed',
		resourceType: 'organization',
		details: { membershipId: input.membershipId }
	});

	if (membership?.userId) {
		const orgName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'the organization';

		await ports.notifications.notifyUser(ports.auth.orgId, membership.userId, {
			type: 'member_removed',
			title: 'Removed from Organization',
			message: `You have been removed from "${orgName}".`
		});

		await ports.notifications.notifyAdmins(ports.auth.orgId, actorUserId, {
			type: 'member_removed',
			title: 'Member Removed',
			message: `"${input.actorEmail ?? ''}" removed "${membership.email ?? ''}" from the organization.`,
			link: `/org/${ports.auth.orgId}/settings`
		});
	}

	return { success: true };
}

export async function updateOrganizationMemberPermissions(
	ports: OrganizationSettingsMemberManagementPorts,
	input: UpdateOrganizationMemberPermissionsInput
): Promise<{ permissionSuccess: true }> {
	if (!validateUUID(input.membershipId)) {
		fail(400, 'Invalid membership ID');
	}

	const actorUserId = requireActorUserId(ports.auth);
	const targetMembership = await ports.settings.findMembershipById(ports.auth.orgId, input.membershipId);

	if (targetMembership?.role === 'owner') {
		fail(400, 'Cannot modify owner permissions');
	}

	if (input.preset === 'admin' || targetMembership?.role === 'admin') {
		ports.auth.requireOwner();
	} else {
		ports.auth.requireManageMembers();
	}

	const permissions = resolveUpdatePermissions(input.preset, input.customPermissions);
	const role = input.preset === 'admin' ? 'admin' : 'member';
	const errorMessage = await ports.settings.updateMembership({
		organizationId: ports.auth.orgId,
		membershipId: input.membershipId,
		role,
		scopedGroupId: input.preset === 'team-leader' ? input.scopedGroupId : null,
		permissions
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.permissions_changed',
		resourceType: 'organization',
		details: { membershipId: input.membershipId, preset: input.preset },
		severity: 'warning'
	});

	if (targetMembership?.userId && targetMembership.userId !== actorUserId) {
		const orgName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'the organization';

		if (targetMembership.role !== role) {
			await ports.notifications.notifyUser(ports.auth.orgId, targetMembership.userId, {
				type: 'member_role_changed',
				title: 'Role Updated',
				message: `Your role in "${orgName}" has been changed to ${role}.`
			});
		} else {
			await ports.notifications.notifyUser(ports.auth.orgId, targetMembership.userId, {
				type: 'member_permissions_changed',
				title: 'Permissions Updated',
				message: `Your permissions in "${orgName}" have been updated.`
			});
		}
	}

	return { permissionSuccess: true };
}

function requireActorUserId(auth: AuthContext): string {
	if (!auth.userId) {
		fail(401, 'Authentication required');
	}

	return auth.userId;
}

function normalizeEmail(email: string): string {
	return sanitizeString(email, 254).toLowerCase();
}

function resolvePresetPermissions(preset: string): OrganizationMemberPermissions {
	return PERMISSION_PRESETS[preset as keyof typeof PERMISSION_PRESETS] ?? PERMISSION_PRESETS['full-editor'];
}

function resolveUpdatePermissions(
	preset: string,
	customPermissions?: Partial<OrganizationMemberPermissions> | null
): OrganizationMemberPermissions {
	if (preset !== 'custom') {
		return resolvePresetPermissions(preset);
	}

	return {
		canViewCalendar: !!customPermissions?.canViewCalendar,
		canEditCalendar: !!customPermissions?.canEditCalendar,
		canViewPersonnel: !!customPermissions?.canViewPersonnel,
		canEditPersonnel: !!customPermissions?.canEditPersonnel,
		canViewTraining: !!customPermissions?.canViewTraining,
		canEditTraining: !!customPermissions?.canEditTraining,
		canViewCriticalTasks: !!customPermissions?.canViewCriticalTasks,
		canEditCriticalTasks: !!customPermissions?.canEditCriticalTasks,
		canViewOnboarding: !!customPermissions?.canViewOnboarding,
		canEditOnboarding: !!customPermissions?.canEditOnboarding,
		canViewLeadersBook: !!customPermissions?.canViewLeadersBook,
		canEditLeadersBook: !!customPermissions?.canEditLeadersBook,
		canManageMembers: !!customPermissions?.canManageMembers
	};
}
