import type { OrganizationMemberPermissions } from '$lib/types';
import { POLICY_ACTION_CATALOG, type PolicyReasonCode } from '$lib/access/policyEvaluator';
import {
	memberAccessCommandToStorage,
	type EditableMembershipRole,
	type TargetMemberAccessCommand,
	type MemberAccessStorageCommand
} from '$lib/access/memberAccessCommands';
import { type CapabilityOverrideMap, type StoredMemberPreset } from '$lib/access/memberAccessShape';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, AuditPort, NotificationPort, ReadOnlyGuard } from '$lib/server/core/ports';
import { validateEmail, validateUUID } from '$lib/server/validation';
import { requireGovernancePolicy } from './governancePolicy';
import { normalizeInvitationEmail } from './invitationEmail';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, policyDenialAuditDetails } from './policyDenial';

export interface OrganizationInvitationCreateInput {
	organizationId: string;
	email: string;
	invitedBy: string;
	role: EditableMembershipRole;
	singleGroupCompatibilityId: string | null;
	permissions: OrganizationMemberPermissions;
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

export interface OrganizationMembershipUpdateInput {
	organizationId: string;
	membershipId: string;
	role: 'admin' | 'member';
	singleGroupCompatibilityId: string | null;
	permissions: OrganizationMemberPermissions;
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

interface OrganizationMembershipRecord {
	userId: string | null;
	role: string | null;
	email: string | null;
}

export type OrganizationInvitationRevokeStatus =
	| 'revoked'
	| 'not_found'
	| 'expired'
	| 'already_accepted'
	| 'already_declined'
	| 'failed';

export interface OrganizationInvitationRevokeResult {
	status: OrganizationInvitationRevokeStatus;
	email: string | null;
}

export interface OrganizationSettingsMemberManagementPort {
	findPendingInvitation(orgId: string, email: string): Promise<{ id: string } | null>;
	createInvitation(input: OrganizationInvitationCreateInput): Promise<string | null>;
	revokeInvitation(orgId: string, inviteId: string): Promise<OrganizationInvitationRevokeResult>;
	findMembershipById(orgId: string, membershipId: string): Promise<OrganizationMembershipRecord | null>;
	removeMembership(orgId: string, membershipId: string): Promise<string | null>;
	updateMembership(input: OrganizationMembershipUpdateInput): Promise<string | null>;
	getOrganizationName(orgId: string): Promise<string | null>;
}

interface OrganizationSettingsMemberManagementPorts {
	auth: AuthContext;
	audit: AuditPort;
	notifications: NotificationPort;
	readOnlyGuard?: ReadOnlyGuard;
	settings: OrganizationSettingsMemberManagementPort;
}

interface InviteOrganizationMemberInput {
	email: string;
	membershipRole?: EditableMembershipRole | null;
	memberAccess?: TargetMemberAccessCommand | null;
	actorEmail?: string | null;
}

interface RevokeOrganizationInvitationInput {
	inviteId: string;
}

interface RemoveOrganizationMemberInput {
	membershipId: string;
	actorEmail?: string | null;
}

interface LeaveOrganizationInput {
	membershipId: string;
	confirmation: string;
	actorEmail?: string | null;
}

interface UpdateOrganizationMemberPermissionsInput {
	membershipId: string;
	membershipRole: EditableMembershipRole;
	memberAccess?: TargetMemberAccessCommand | null;
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
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.inviteMember);
	const membershipRole = input.membershipRole ?? 'member';
	const invitesAdminRole = membershipRole === 'admin';
	if (invitesAdminRole) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	}

	const actorUserId = requireActorUserId(ports.auth);
	const email = normalizeEmail(input.email);

	if (!validateEmail(email)) {
		fail(400, 'Please enter a valid email address');
	}

	const accessCommand = buildMemberAccessStorageCommand({
		membershipRole,
		memberAccess: input.memberAccess
	});
	if (!invitesAdminRole && accessCommand.permissions.canManageMembers) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	}

	const existing = await ports.settings.findPendingInvitation(ports.auth.orgId, email);
	if (existing) {
		fail(400, 'An invitation for this email is already pending');
	}

	const errorMessage = await ports.settings.createInvitation({
		organizationId: ports.auth.orgId,
		email,
		invitedBy: actorUserId,
		role: accessCommand.role,
		singleGroupCompatibilityId: accessCommand.singleGroupCompatibilityId,
		permissions: accessCommand.permissions,
		memberPreset: accessCommand.memberPreset,
		capabilityOverrides: accessCommand.capabilityOverrides,
		accessScopeKind: accessCommand.accessScopeKind,
		accessScopeGroupIds: accessCommand.accessScopeGroupIds
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.invite',
		resourceType: 'organization',
		details: {
			email,
			membershipRole: accessCommand.role,
			memberPreset: accessCommand.memberPreset
		}
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
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.revokeInvitation);

	if (!validateUUID(input.inviteId)) {
		fail(400, 'Invalid invitation ID');
	}

	const revoked = await ports.settings.revokeInvitation(ports.auth.orgId, input.inviteId);
	if (revoked.status === 'not_found') {
		fail(404, 'Invitation not found');
	}
	if (revoked.status === 'expired') {
		fail(400, 'Invitation has expired');
	}
	if (revoked.status === 'already_accepted') {
		fail(400, 'Invitation has already been accepted');
	}
	if (revoked.status === 'already_declined') {
		fail(400, 'Invitation has already been declined');
	}
	if (revoked.status !== 'revoked') {
		fail(500, 'Failed to revoke invitation');
	}

	ports.audit.log({
		action: 'member.invite_revoked',
		resourceType: 'organization',
		details: { inviteId: input.inviteId }
	});

	await notifyAdminsOfRevokedInvitation(ports, {
		actorUserId: requireActorUserId(ports.auth),
		email: revoked.email
	});

	return { success: true };
}

export async function removeOrganizationMember(
	ports: OrganizationSettingsMemberManagementPorts,
	input: RemoveOrganizationMemberInput
): Promise<{ success: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.removeMember);

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

export async function leaveOrganization(
	ports: OrganizationSettingsMemberManagementPorts,
	input: LeaveOrganizationInput
): Promise<{ success: true }> {
	if (input.confirmation !== 'YES') {
		fail(400, 'Type YES to confirm leaving the organization');
	}

	if (!validateUUID(input.membershipId)) {
		fail(400, 'Invalid membership ID');
	}

	const actorUserId = requireActorUserId(ports.auth);
	const membership = await ports.settings.findMembershipById(ports.auth.orgId, input.membershipId);

	await requireIdentityPolicy(ports, actorUserId, membership?.userId ?? null);

	if (membership?.role === 'owner') {
		fail(400, 'Organization owners must transfer ownership before leaving the organization');
	}

	const errorMessage = await ports.settings.removeMembership(ports.auth.orgId, input.membershipId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.left',
		resourceType: 'organization',
		details: { membershipId: input.membershipId }
	});

	const orgName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'the organization';
	await ports.notifications.notifyAdmins(ports.auth.orgId, actorUserId, {
		type: 'member_left',
		title: 'Member Left Organization',
		message: `"${input.actorEmail ?? ''}" left "${orgName}".`,
		link: `/org/${ports.auth.orgId}/settings`
	});

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

	const updatesAdminRole = input.membershipRole === 'admin' || targetMembership?.role === 'admin';
	if (updatesAdminRole) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	} else {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateMemberAccess);
	}

	const accessCommand = buildMemberAccessStorageCommand({
		membershipRole: input.membershipRole,
		memberAccess: input.memberAccess
	});
	if (!updatesAdminRole && accessCommand.permissions.canManageMembers) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	}

	const errorMessage = await ports.settings.updateMembership({
		organizationId: ports.auth.orgId,
		membershipId: input.membershipId,
		role: accessCommand.role,
		singleGroupCompatibilityId: accessCommand.singleGroupCompatibilityId,
		permissions: accessCommand.permissions,
		memberPreset: accessCommand.memberPreset,
		capabilityOverrides: accessCommand.capabilityOverrides,
		accessScopeKind: accessCommand.accessScopeKind,
		accessScopeGroupIds: accessCommand.accessScopeGroupIds
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.permissions_changed',
		resourceType: 'organization',
		details: {
			membershipId: input.membershipId,
			membershipRole: accessCommand.role,
			memberPreset: accessCommand.memberPreset
		},
		severity: 'warning'
	});

	if (targetMembership?.userId && targetMembership.userId !== actorUserId) {
		const orgName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'the organization';

		if (targetMembership.role !== accessCommand.role) {
			await ports.notifications.notifyUser(ports.auth.orgId, targetMembership.userId, {
				type: 'member_role_changed',
				title: 'Role Updated',
				message: `Your role in "${orgName}" has been changed to ${accessCommand.role}.`
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

async function notifyAdminsOfRevokedInvitation(
	ports: OrganizationSettingsMemberManagementPorts,
	input: { actorUserId: string; email: string | null }
): Promise<void> {
	try {
		await ports.notifications.notifyAdmins(ports.auth.orgId, input.actorUserId, {
			type: 'member_invite_revoked',
			title: 'Invitation Revoked',
			message: input.email
				? `"${input.email}" can no longer use the revoked organization invitation.`
				: 'An organization invitation was revoked.',
			link: `/org/${ports.auth.orgId}/settings`
		});
	} catch (error) {
		console.error('[org-settings-member-management]', {
			status: 'revoked-notification-failed',
			organizationId: ports.auth.orgId,
			userId: input.actorUserId,
			error
		});
	}
}

async function requireIdentityPolicy(
	ports: OrganizationSettingsMemberManagementPorts,
	actorUserId: string,
	resourceUserId: string | null
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		POLICY_ACTION_CATALOG.identity.leaveOrganization,
		resourceUserId ? { kind: 'user', userId: resourceUserId } : { kind: 'unscoped' },
		{ actorUserId }
	);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: 'organization',
		details: policyDenialAuditDetails(decision),
		message: identityPolicyDenialMessage(decision.reasonCode)
	});
}

function identityPolicyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

	return 'You can only leave organizations for your own account';
}

function normalizeEmail(email: string): string {
	return normalizeInvitationEmail(email);
}

function buildMemberAccessStorageCommand(command: {
	membershipRole: EditableMembershipRole;
	memberAccess?: TargetMemberAccessCommand | null;
}): MemberAccessStorageCommand {
	try {
		return memberAccessCommandToStorage(command);
	} catch (error) {
		if (error instanceof Error && Reflect.get(error, 'status') === 400) {
			fail(400, error.message);
		}

		throw error;
	}
}
