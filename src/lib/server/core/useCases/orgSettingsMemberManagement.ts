import type { OrganizationMemberPermissions } from '$lib/types';
import { POLICY_ACTION_CATALOG, type PolicyReasonCode } from '$lib/access/policyEvaluator';
import {
	currentPresetToMemberAccessStorage,
	DURABLE_FEATURE_LANES,
	isCapabilityLevel,
	resolveCurrentPresetPermissions,
	resolveCurrentUpdatePermissions,
	serializeScopeSetForStorage,
	targetMemberAccessToCurrentPermissionFlags,
	targetMemberAccessToStorage,
	type CapabilityOverrideMap,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, AuditPort, NotificationPort, ReadOnlyGuard } from '$lib/server/core/ports';
import { sanitizeString, validateEmail, validateUUID } from '$lib/server/validation';
import { requireGovernancePolicy } from './governancePolicy';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';

export interface OrganizationInvitationCreateInput {
	organizationId: string;
	email: string;
	invitedBy: string;
	scopedGroupId: string | null;
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
	scopedGroupId: string | null;
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
	readOnlyGuard?: ReadOnlyGuard;
	settings: OrganizationSettingsMemberManagementPort;
}

interface InviteOrganizationMemberInput {
	email: string;
	preset: string;
	scopedGroupId?: string | null;
	capabilityOverrides?: CapabilityOverrideMap | null;
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
	actorEmail?: string | null;
}

interface MemberAccessStorageFields {
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
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
	actorEmail?: string | null;
}

interface UpdateOrganizationMemberPermissionsInput {
	membershipId: string;
	preset: string;
	scopedGroupId?: string | null;
	customPermissions?: Partial<OrganizationMemberPermissions> | null;
	capabilityOverrides?: CapabilityOverrideMap | null;
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
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

	const actorUserId = requireActorUserId(ports.auth);
	const email = normalizeEmail(input.email);

	if (!validateEmail(email)) {
		fail(400, 'Please enter a valid email address');
	}

	const existing = await ports.settings.findPendingInvitation(ports.auth.orgId, email);
	if (existing) {
		fail(400, 'An invitation for this email is already pending');
	}

	const permissions = isTargetMemberPreset(input.preset)
		? targetMemberAccessToCurrentPermissionFlags({
				membershipRole: 'member',
				memberPreset: input.preset,
				capabilityOverrides: input.capabilityOverrides,
				scopeSet: buildScopeSet(input)
			})
		: resolveCurrentPresetPermissions(input.preset);
	const accessStorage = buildCurrentPresetStorageFields(input);
	const errorMessage = await ports.settings.createInvitation({
		organizationId: ports.auth.orgId,
		email,
		invitedBy: actorUserId,
		scopedGroupId: getLegacyScopedGroupId(input),
		permissions,
		...accessStorage
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
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.revokeInvitation);

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

	const updatesAdminAccess = input.preset === 'admin' || targetMembership?.role === 'admin';
	if (updatesAdminAccess) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	} else {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateMemberAccess);
	}

	const permissions = isTargetMemberPreset(input.preset)
		? targetMemberAccessToCurrentPermissionFlags({
				membershipRole: 'member',
				memberPreset: input.preset,
				capabilityOverrides: input.capabilityOverrides,
				scopeSet: buildScopeSet(input)
			})
		: resolveCurrentUpdatePermissions(input.preset, input.customPermissions);
	const accessStorage = buildCurrentPresetStorageFields(input);
	const role = input.preset === 'admin' ? 'admin' : 'member';
	const errorMessage = await ports.settings.updateMembership({
		organizationId: ports.auth.orgId,
		membershipId: input.membershipId,
		role,
		scopedGroupId: getLegacyScopedGroupId(input),
		permissions,
		...accessStorage
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

	ports.audit.log({
		action: 'policy.denied',
		resourceType: 'organization',
		details: {
			policyAction: decision.action.id,
			reasonCode: decision.reasonCode,
			...(decision.blockingOverlay ? { blockingOverlay: decision.blockingOverlay.kind } : {})
		},
		severity: 'warning'
	});

	fail(403, identityPolicyDenialMessage(decision.reasonCode));
}

function identityPolicyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:read-only-overlay') {
		return 'Organization is in read-only mode';
	}

	return 'You can only leave organizations for your own account';
}

function normalizeEmail(email: string): string {
	return sanitizeString(email, 254).toLowerCase();
}

function buildCurrentPresetStorageFields(input: {
	preset: string;
	scopedGroupId?: string | null;
	customPermissions?: Partial<OrganizationMemberPermissions> | null;
	capabilityOverrides?: CapabilityOverrideMap | null;
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
}): MemberAccessStorageFields {
	const accessStorage = isTargetMemberPreset(input.preset)
		? targetMemberAccessToStorage({
				membershipRole: 'member',
				memberPreset: input.preset,
				capabilityOverrides: input.capabilityOverrides,
				scopeSet: buildScopeSet(input)
			})
		: currentPresetToMemberAccessStorage(input);
	const serializedScope = serializeScopeSetForStorage(accessStorage.scopeSet);

	return {
		memberPreset: accessStorage.memberPreset,
		capabilityOverrides: accessStorage.capabilityOverrides,
		accessScopeKind: serializedScope.access_scope_kind,
		accessScopeGroupIds: serializedScope.access_scope_group_ids
	};
}

function buildScopeSet(input: {
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
	scopedGroupId?: string | null;
}) {
	if (input.accessScopeKind !== 'groups') {
		return { kind: 'organization' } as const;
	}

	const groupIds = (input.accessScopeGroupIds ?? [input.scopedGroupId ?? '']).filter(validateUUID);
	return groupIds.length > 0 ? ({ kind: 'groups', groupIds } as const) : ({ kind: 'organization' } as const);
}

function getLegacyScopedGroupId(input: {
	preset: string;
	scopedGroupId?: string | null;
	accessScopeKind?: 'organization' | 'groups' | null;
	accessScopeGroupIds?: string[] | null;
}): string | null {
	if (isTargetMemberPreset(input.preset)) {
		const scopeSet = buildScopeSet(input);
		return scopeSet.kind === 'groups' ? (scopeSet.groupIds[0] ?? null) : null;
	}
	return input.preset === 'team-leader' ? (input.scopedGroupId ?? null) : null;
}

function isTargetMemberPreset(preset: string): preset is StoredMemberPreset {
	return preset === 'viewer' || preset === 'operator' || preset === 'editor';
}

export function parseCapabilityOverrides(formData: FormData): CapabilityOverrideMap {
	const overrides: CapabilityOverrideMap = {};
	for (const lane of DURABLE_FEATURE_LANES) {
		const value = formData.get(`capability:${lane}`);
		if (isCapabilityLevel(value)) {
			overrides[lane] = value;
		}
	}
	return overrides;
}
