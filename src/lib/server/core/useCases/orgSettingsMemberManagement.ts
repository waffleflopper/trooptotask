import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	memberAccessCommandToStorage,
	type EditableMembershipRole,
	type TargetMemberAccessCommand,
	type MemberAccessStorageCommand
} from '$lib/access/memberAccessCommands';
import { type CapabilityOverrideMap, type StoredMemberPreset } from '$lib/access/memberAccessShape';
import { fail } from '$lib/server/core/errors';
import type { AuthContext, AuditPort, NotificationPort } from '$lib/server/core/ports';
import {
	createAccountSetupLinkIssuance,
	redactProviderError,
	type AccountSetupLinkIssuanceCreator,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkNotCreatedReason
} from '$lib/server/accountSetupLinkIssuance';
import {
	ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION,
	ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION,
	ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION,
	type SensitiveAction,
	type SensitiveActionAuthorizer,
	type SensitiveActionDecision
} from '$features/identity/contracts';
import { sensitiveActionDecisionAuditDetails, throwSensitiveActionFailure } from '$features/identity/index.server';
import {
	organizationInvitationRateLimitAuditDetails,
	organizationInvitationRateLimitMessage,
	type OrganizationInvitationRateLimitAction,
	type OrganizationInvitationRateLimiter
} from '$lib/server/organizationInvitationRateLimit';
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
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

export type OrganizationInvitationCreateResult =
	| { status: 'created'; invitationId: string; createdAt: string }
	| { status: 'failed'; message: string };

export type OrganizationInvitationAccessRequestBridgeResult =
	| { status: 'created'; accessRequestId: string }
	| { status: 'linked'; accessRequestId: string }
	| { status: 'already-linked'; accessRequestId: string }
	| { status: 'failed'; message: string };

export interface OrganizationInvitationAccessRequestBridgeInput {
	organizationId: string;
	invitationId: string;
	email: string;
	invitedBy: string;
	invitedAt: string;
	role: EditableMembershipRole;
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

export interface OrganizationInvitationResendLookupResult {
	id: string;
	email: string;
	status: 'pending' | 'expired';
	requiresAccountSetup: boolean;
}

export interface OrganizationMembershipUpdateInput {
	organizationId: string;
	membershipId: string;
	role: 'admin' | 'member';
	memberPreset: StoredMemberPreset;
	capabilityOverrides: CapabilityOverrideMap;
	accessScopeKind: 'organization' | 'groups';
	accessScopeGroupIds: string[];
}

interface OrganizationMembershipRecord {
	userId: string | null;
	role: string | null;
	email: string | null;
	canManageMembers: boolean | null;
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
	findPendingInvitationById(orgId: string, inviteId: string): Promise<OrganizationInvitationResendLookupResult | null>;
	findUserAccountByEmail(email: string): Promise<{ id: string; email: string; emailConfirmed?: boolean } | null>;
	createInvitation(input: OrganizationInvitationCreateInput): Promise<OrganizationInvitationCreateResult>;
	createOrLinkApprovedAccessRequestForInvitation(
		input: OrganizationInvitationAccessRequestBridgeInput
	): Promise<OrganizationInvitationAccessRequestBridgeResult>;
	blockInvitationAfterAccessRequestBridgeFailure(input: {
		organizationId: string;
		invitationId: string;
		blockedBy: string;
		reason: string;
	}): Promise<{ status: 'blocked' } | { status: 'failed'; message: string }>;
	revokeInvitation(orgId: string, inviteId: string): Promise<OrganizationInvitationRevokeResult>;
	findMembershipById(orgId: string, membershipId: string): Promise<OrganizationMembershipRecord | null>;
	removeMembership(orgId: string, membershipId: string): Promise<string | null>;
	updateMembership(input: OrganizationMembershipUpdateInput): Promise<string | null>;
	getOrganizationName(orgId: string): Promise<string | null>;
}

export interface OrganizationInvitationDeliveryPort {
	sendInvitationEmail(input: {
		organizationId: string;
		invitationId: string;
		email: string;
		organizationName: string;
		invitedByEmail: string | null;
		origin: string;
		requiresAccountSetup: boolean;
		requiresAccessRequest?: boolean;
	}): Promise<{ status: 'sent'; outbox: { id: string } } | { status: 'failed'; outbox: { id: string }; error: string }>;
}

interface OrganizationSettingsMemberManagementPorts {
	auth: AuthContext;
	audit: AuditPort;
	notifications: NotificationPort;

	settings: OrganizationSettingsMemberManagementPort;
	invitationDelivery?: OrganizationInvitationDeliveryPort;
	invitationRateLimiter?: OrganizationInvitationRateLimiter;
	sensitiveActionAuthorizer?: SensitiveActionAuthorizer;
}

/**
 * The invite path composes `accountSetupLinkIssuance` from these two, exactly as the
 * platform-admin path does. They are required rather than optional because an invite
 * that silently issues no credential is the dead end this bridge exists to remove.
 */
interface OrganizationInvitationAccountSetupPorts {
	setupLinks: AccountSetupLinkIssuanceCreator;
	setupDelivery: AccountSetupLinkIssuanceDelivery;
}

type InviteOrganizationMemberPorts = OrganizationSettingsMemberManagementPorts &
	OrganizationInvitationAccountSetupPorts;

interface InviteOrganizationMemberInput {
	email: string;
	membershipRole?: EditableMembershipRole | null;
	memberAccess?: TargetMemberAccessCommand | null;
	actorEmail?: string | null;
	origin?: string | null;
}

interface RevokeOrganizationInvitationInput {
	inviteId: string;
}

interface ResendOrganizationInvitationInput {
	inviteId: string;
	actorEmail?: string | null;
	origin: string;
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

interface UpdateOrganizationMemberAccessInput {
	membershipId: string;
	membershipRole: EditableMembershipRole;
	memberAccess?: TargetMemberAccessCommand | null;
	actorEmail?: string | null;
}

export async function inviteOrganizationMember(
	ports: InviteOrganizationMemberPorts,
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
	const existing = await ports.settings.findPendingInvitation(ports.auth.orgId, email);
	if (existing) {
		fail(400, 'An invitation for this email is already pending');
	}

	const inviteRequiresStepUp = isHighPrivilegeAccess(accessCommand.role, false);
	const sensitiveAction = inviteRequiresStepUp
		? await authorizeMemberManagementSensitiveAction(ports, {
				action: ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION,
				deniedAuditAction: 'member.high_privilege_invite_authorization_denied',
				targetId: email,
				targetType: 'organization_invitation',
				details: {
					email,
					membershipRole: accessCommand.role,
					memberPreset: accessCommand.memberPreset
				}
			})
		: null;

	const existingUserAccount = await ports.settings.findUserAccountByEmail(email);
	const rateLimit = await checkInvitationRateLimit(ports, {
		action: 'create',
		actorUserId,
		email
	});

	const createResult = await ports.settings.createInvitation({
		organizationId: ports.auth.orgId,
		email,
		invitedBy: actorUserId,
		role: accessCommand.role,
		memberPreset: accessCommand.memberPreset,
		capabilityOverrides: accessCommand.capabilityOverrides,
		accessScopeKind: accessCommand.accessScopeKind,
		accessScopeGroupIds: accessCommand.accessScopeGroupIds
	});

	if (createResult.status === 'failed') {
		fail(500, createResult.message);
	}

	const shouldBridgeAccessRequest = !existingUserAccount;
	const accessRequestBridge = shouldBridgeAccessRequest
		? await bridgeInvitationToAccessRequest(ports, {
				organizationId: ports.auth.orgId,
				invitationId: createResult.invitationId,
				email,
				invitedBy: actorUserId,
				invitedAt: createResult.createdAt,
				role: accessCommand.role,
				memberPreset: accessCommand.memberPreset,
				capabilityOverrides: accessCommand.capabilityOverrides,
				accessScopeKind: accessCommand.accessScopeKind,
				accessScopeGroupIds: accessCommand.accessScopeGroupIds
			})
		: null;

	if (accessRequestBridge?.status === 'failed') {
		fail(500, 'Invitation could not be created because platform access setup could not be linked');
	}

	if (accessRequestBridge) {
		await issueInvitationAccountSetupLink(ports, {
			accessRequestId: accessRequestBridge.accessRequestId,
			organizationId: ports.auth.orgId,
			invitationId: createResult.invitationId,
			email,
			invitedBy: actorUserId,
			publicOrigin: input.origin ?? ''
		});
	}

	ports.audit.log({
		action: 'member.invite',
		resourceType: 'organization',
		details: {
			email,
			membershipRole: accessCommand.role,
			memberPreset: accessCommand.memberPreset,
			...(sensitiveAction ? { sensitiveAction: sensitiveActionDecisionAuditDetails(sensitiveAction) } : {}),
			...(rateLimit ? { rateLimit } : {})
		}
	});

	const deliveryStatus = await deliverInvitationEmail(ports, {
		invitationId: createResult.invitationId,
		email,
		actorEmail: input.actorEmail ?? null,
		origin: input.origin ?? '',
		requiresAccountSetup: !existingUserAccount,
		mode: 'initial',
		rateLimit
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
			deliveryStatus === 'failed'
				? 'Invitation created, but email delivery failed. You can resend it from Pending Invitations.'
				: deliveryStatus === 'sent'
					? 'Invitation created and email delivery was queued.'
					: 'Invitation created! Tell the user to log in to Troop to Task - they will see the invitation on their dashboard.'
	};
}

async function bridgeInvitationToAccessRequest(
	ports: OrganizationSettingsMemberManagementPorts,
	input: OrganizationInvitationAccessRequestBridgeInput
): Promise<{ status: 'created' | 'linked' | 'already-linked'; accessRequestId: string } | { status: 'failed' }> {
	const result = await ports.settings.createOrLinkApprovedAccessRequestForInvitation(input);
	if (result.status === 'failed') {
		await blockInvitationAfterPlatformAccessFailure(ports, {
			organizationId: input.organizationId,
			invitationId: input.invitationId,
			blockedBy: input.invitedBy,
			email: input.email,
			reason: result.message,
			failureAction: 'member.invite_access_request_link_failed',
			blockFailureAction: 'member.invite_access_request_link_block_failed'
		});
		return { status: 'failed' };
	}

	ports.audit.log({
		action:
			result.status === 'created'
				? 'member.invite_access_request_created'
				: result.status === 'linked'
					? 'member.invite_access_request_linked'
					: 'member.invite_access_request_already_linked',
		resourceType: 'organization',
		details: {
			email: input.email,
			invitationId: input.invitationId,
			accessRequestId: result.accessRequestId
		},
		severity: 'info'
	});

	return { status: result.status, accessRequestId: result.accessRequestId };
}

/**
 * Blocks the just-created invitation, records why, and reports whether the block itself
 * held. Shared by the two ways platform access setup can leave an invitation stranded:
 * the Access Request bridge failing, and the setup link failing to be created.
 */
async function blockInvitationAfterPlatformAccessFailure(
	ports: OrganizationSettingsMemberManagementPorts,
	input: {
		organizationId: string;
		invitationId: string;
		blockedBy: string;
		email: string;
		reason: string;
		failureAction: string;
		blockFailureAction: string;
		failureDetails?: Record<string, unknown>;
	}
): Promise<void> {
	const blockResult = await ports.settings.blockInvitationAfterAccessRequestBridgeFailure({
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		blockedBy: input.blockedBy,
		reason: input.reason
	});

	ports.audit.log({
		action: input.failureAction,
		resourceType: 'organization',
		details: {
			email: input.email,
			invitationId: input.invitationId,
			...(input.failureDetails ?? { reason: input.reason }),
			blocked: blockResult.status === 'blocked'
		},
		severity: blockResult.status === 'blocked' ? 'warning' : 'critical'
	});

	if (blockResult.status === 'failed') {
		ports.audit.log({
			action: input.blockFailureAction,
			resourceType: 'organization',
			details: {
				email: input.email,
				invitationId: input.invitationId,
				reason: blockResult.message
			},
			severity: 'critical'
		});
	}
}

/**
 * Issues the invitee's Account Setup Link through the shared issuance module. The Access
 * Request is already approved by this point, so anything short of a live link is a failed
 * invitation — except `concurrent-create`, which means a sibling writer just minted one.
 * Delivery failure is non-fatal: it leaves a valid link and working recovery routes.
 */
async function issueInvitationAccountSetupLink(
	ports: InviteOrganizationMemberPorts,
	input: {
		accessRequestId: string;
		organizationId: string;
		invitationId: string;
		email: string;
		invitedBy: string;
		publicOrigin: string;
	}
): Promise<void> {
	const issuance = createAccountSetupLinkIssuance({
		setupLinks: ports.setupLinks,
		setupDelivery: ports.setupDelivery,
		audit: (event) => ports.audit.log(event)
	});

	let notCreatedReason: AccountSetupLinkNotCreatedReason | 'provider-error' | null = null;
	try {
		const issued = await issuance.issue({
			accessRequestId: input.accessRequestId,
			email: input.email,
			publicOrigin: input.publicOrigin,
			origin: 'organization_invitation',
			context: { invitationId: input.invitationId }
		});
		if (issued.status !== 'not_created') return;
		notCreatedReason = issued.reason;
	} catch (error) {
		console.error('[org-settings-member-management]', {
			operation: 'issueInvitationAccountSetupLink',
			error: redactProviderError(error)
		});
		notCreatedReason = 'provider-error';
	}

	if (notCreatedReason === 'concurrent-create') {
		ports.audit.log({
			action: 'member.invite_account_setup_link_not_created',
			resourceType: 'organization',
			details: {
				email: input.email,
				invitationId: input.invitationId,
				accessRequestId: input.accessRequestId,
				reason: notCreatedReason
			},
			severity: 'info'
		});
		return;
	}

	await blockInvitationAfterPlatformAccessFailure(ports, {
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		blockedBy: input.invitedBy,
		email: input.email,
		reason: notCreatedReason,
		failureAction: 'member.invite_account_setup_link_not_created',
		blockFailureAction: 'member.invite_account_setup_link_block_failed',
		failureDetails: { accessRequestId: input.accessRequestId, reason: notCreatedReason }
	});

	fail(500, 'Invitation could not be created because the account setup link could not be issued');
}

export async function resendOrganizationInvitation(
	ports: OrganizationSettingsMemberManagementPorts,
	input: ResendOrganizationInvitationInput
): Promise<{
	success: true;
	inviteSuccess: true;
	inviteDeliveryStatus: 'sent' | 'failed' | 'not_configured';
	inviteMessage: string;
}> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.inviteMember);

	if (!validateUUID(input.inviteId)) {
		fail(400, 'Invalid invitation ID');
	}

	const invitation = await ports.settings.findPendingInvitationById(ports.auth.orgId, input.inviteId);
	if (!invitation) {
		fail(404, 'Pending invitation not found');
	}
	if (invitation.status === 'expired') {
		fail(400, 'Invitation has expired. Create a new invitation instead.');
	}

	const rateLimit = await checkInvitationRateLimit(ports, {
		action: 'resend',
		actorUserId: requireActorUserId(ports.auth),
		email: invitation.email,
		invitationId: invitation.id
	});
	const existingUserAccount = await ports.settings.findUserAccountByEmail(invitation.email);
	const hasUsableUserAccount = !!existingUserAccount && existingUserAccount.emailConfirmed !== false;
	const requiresAccessRequest = !invitation.requiresAccountSetup && !hasUsableUserAccount;

	const deliveryStatus = await deliverInvitationEmail(ports, {
		invitationId: invitation.id,
		email: invitation.email,
		actorEmail: input.actorEmail ?? null,
		origin: input.origin,
		requiresAccountSetup: invitation.requiresAccountSetup,
		requiresAccessRequest,
		mode: 'resend',
		rateLimit
	});

	return {
		success: true,
		inviteSuccess: true,
		inviteDeliveryStatus: deliveryStatus,
		inviteMessage:
			deliveryStatus === 'failed'
				? 'Invitation email delivery failed. The pending invitation is still intact and can be resent.'
				: deliveryStatus === 'not_configured'
					? 'Invitation email delivery is not configured.'
					: 'Invitation email resent.'
	};
}

async function deliverInvitationEmail(
	ports: OrganizationSettingsMemberManagementPorts,
	input: {
		invitationId: string;
		email: string;
		actorEmail: string | null;
		origin: string;
		requiresAccountSetup: boolean;
		requiresAccessRequest?: boolean;
		mode: 'initial' | 'resend';
		rateLimit?: Record<string, unknown> | null;
	}
): Promise<'sent' | 'failed' | 'not_configured'> {
	if (!ports.invitationDelivery || !input.origin) {
		return 'not_configured';
	}

	const organizationName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'your organization';
	let delivery: Awaited<ReturnType<OrganizationInvitationDeliveryPort['sendInvitationEmail']>>;
	try {
		delivery = await ports.invitationDelivery.sendInvitationEmail({
			organizationId: ports.auth.orgId,
			invitationId: input.invitationId,
			email: input.email,
			organizationName,
			invitedByEmail: input.actorEmail,
			origin: input.origin,
			requiresAccountSetup: input.requiresAccountSetup,
			requiresAccessRequest: input.requiresAccessRequest
		});
	} catch (error) {
		ports.audit.log({
			action:
				input.mode === 'resend' ? 'member.invite_email_resend_delivery_failed' : 'member.invite_email_delivery_failed',
			resourceType: 'organization',
			details: {
				email: input.email,
				invitationId: input.invitationId,
				deliveryMode: input.mode,
				reason: 'outbox-write-failed',
				...(input.rateLimit ? { rateLimit: input.rateLimit } : {})
			},
			severity: 'warning'
		});
		console.error('[org-settings-member-management]', {
			status: 'invitation-email-delivery-failed',
			organizationId: ports.auth.orgId,
			invitationId: input.invitationId,
			mode: input.mode,
			error
		});
		return 'failed';
	}

	ports.audit.log({
		action:
			delivery.status === 'sent'
				? input.mode === 'resend'
					? 'member.invite_email_resent'
					: 'member.invite_email_sent'
				: input.mode === 'resend'
					? 'member.invite_email_resend_delivery_failed'
					: 'member.invite_email_delivery_failed',
		resourceType: 'organization',
		details: {
			email: input.email,
			invitationId: input.invitationId,
			outboxId: delivery.outbox.id,
			deliveryMode: input.mode,
			...(input.rateLimit ? { rateLimit: input.rateLimit } : {})
		},
		severity: delivery.status === 'sent' ? 'info' : 'warning'
	});

	return delivery.status;
}

export async function revokeOrganizationInvitation(
	ports: OrganizationSettingsMemberManagementPorts,
	input: RevokeOrganizationInvitationInput
): Promise<{ success: true; inviteSuccess: true; inviteMessage: string }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.revokeInvitation);

	if (!validateUUID(input.inviteId)) {
		fail(400, 'Invalid invitation ID');
	}

	const revoked = await ports.settings.revokeInvitation(ports.auth.orgId, input.inviteId);
	if (revoked.status === 'not_found') {
		fail(404, 'Invitation not found');
	}
	if (revoked.status === 'expired') {
		await notifyAdminsOfExpiredInvitation(ports, {
			actorUserId: requireActorUserId(ports.auth),
			email: revoked.email
		});
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

	return { success: true, inviteSuccess: true, inviteMessage: 'Invitation revoked.' };
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
	const removesHighPrivilegeMember = isHighPrivilegeAccess(membership?.role, membership?.canManageMembers);
	const sensitiveAction = removesHighPrivilegeMember
		? await authorizeMemberManagementSensitiveAction(ports, {
				action: ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION,
				deniedAuditAction: 'member.high_privilege_remove_authorization_denied',
				targetId: input.membershipId,
				targetType: 'organization_membership',
				details: {
					membershipId: input.membershipId,
					targetRole: membership?.role ?? null,
					targetCanManageMembers: membership?.canManageMembers ?? null
				}
			})
		: null;

	const errorMessage = await ports.settings.removeMembership(ports.auth.orgId, input.membershipId);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.removed',
		resourceType: 'organization',
		details: {
			membershipId: input.membershipId,
			...(sensitiveAction ? { sensitiveAction: sensitiveActionDecisionAuditDetails(sensitiveAction) } : {})
		}
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

export async function updateOrganizationMemberAccess(
	ports: OrganizationSettingsMemberManagementPorts,
	input: UpdateOrganizationMemberAccessInput
): Promise<{ accessSuccess: true }> {
	if (!validateUUID(input.membershipId)) {
		fail(400, 'Invalid membership ID');
	}

	const actorUserId = requireActorUserId(ports.auth);
	const targetMembership = await ports.settings.findMembershipById(ports.auth.orgId, input.membershipId);

	if (!targetMembership) {
		fail(404, 'Membership not found');
	}

	if (targetMembership?.role === 'owner') {
		fail(400, 'Cannot modify owner access');
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
	const updatesHighPrivilegeAccess =
		isHighPrivilegeAccess(targetMembership?.role, targetMembership?.canManageMembers) ||
		isHighPrivilegeAccess(accessCommand.role, false);
	const sensitiveAction = updatesHighPrivilegeAccess
		? await authorizeMemberManagementSensitiveAction(ports, {
				action: ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION,
				deniedAuditAction: 'member.high_privilege_update_authorization_denied',
				targetId: input.membershipId,
				targetType: 'organization_membership',
				details: {
					membershipId: input.membershipId,
					currentRole: targetMembership?.role ?? null,
					targetRole: accessCommand.role,
					currentCanManageMembers: targetMembership?.canManageMembers ?? null,
					targetCanManageMembers: accessCommand.role === 'admin'
				}
			})
		: null;

	const errorMessage = await ports.settings.updateMembership({
		organizationId: ports.auth.orgId,
		membershipId: input.membershipId,
		role: accessCommand.role,
		memberPreset: accessCommand.memberPreset,
		capabilityOverrides: accessCommand.capabilityOverrides,
		accessScopeKind: accessCommand.accessScopeKind,
		accessScopeGroupIds: accessCommand.accessScopeGroupIds
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	ports.audit.log({
		action: 'member.access_changed',
		resourceType: 'organization',
		details: {
			membershipId: input.membershipId,
			membershipRole: accessCommand.role,
			memberPreset: accessCommand.memberPreset,
			capabilityOverrides: accessCommand.capabilityOverrides,
			accessScopeKind: accessCommand.accessScopeKind,
			accessScopeGroupIds: accessCommand.accessScopeGroupIds,
			...(sensitiveAction ? { sensitiveAction: sensitiveActionDecisionAuditDetails(sensitiveAction) } : {})
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
				type: 'member_access_changed',
				title: 'Access Updated',
				message: `Your access in "${orgName}" has been updated.`
			});
		}
	}

	return { accessSuccess: true };
}

async function authorizeMemberManagementSensitiveAction(
	ports: OrganizationSettingsMemberManagementPorts,
	input: {
		action: SensitiveAction;
		deniedAuditAction: string;
		targetId: string;
		targetType: string;
		details?: Record<string, unknown>;
	}
): Promise<SensitiveActionDecision> {
	const target = { type: input.targetType, id: input.targetId };
	if (!ports.sensitiveActionAuthorizer) {
		fail(500, 'Sensitive action authorization is not configured');
	}

	const decision = await ports.sensitiveActionAuthorizer.authorize({
		action: input.action,
		actorUserId: ports.auth.userId,
		target
	});
	if (!decision.allowed) {
		auditDeniedSensitiveAction(ports, input.deniedAuditAction, decision, input.details);
		throwSensitiveActionFailure(decision);
	}

	return decision;
}

function auditDeniedSensitiveAction(
	ports: Pick<OrganizationSettingsMemberManagementPorts, 'audit'>,
	action: string,
	decision: SensitiveActionDecision,
	details: Record<string, unknown> | undefined
): void {
	ports.audit.log({
		action,
		resourceType: 'organization',
		resourceId: decision.target?.id,
		details: {
			...details,
			sensitiveAction: sensitiveActionDecisionAuditDetails(decision)
		},
		severity: 'warning'
	});
}

function isHighPrivilegeAccess(role: string | null | undefined, canManageMembers: boolean | null | undefined): boolean {
	return role === 'owner' || role === 'admin' || canManageMembers === true;
}

function requireActorUserId(auth: AuthContext): string {
	return auth.userId;
}

async function checkInvitationRateLimit(
	ports: OrganizationSettingsMemberManagementPorts,
	input: {
		action: OrganizationInvitationRateLimitAction;
		actorUserId: string;
		email: string;
		invitationId?: string | null;
	}
): Promise<Record<string, unknown> | null> {
	if (!ports.invitationRateLimiter) {
		return null;
	}

	const decision = await ports.invitationRateLimiter.check({
		action: input.action,
		actorUserId: input.actorUserId,
		organizationId: ports.auth.orgId,
		recipientEmail: input.email,
		invitationId: input.invitationId
	});
	const details = organizationInvitationRateLimitAuditDetails(decision);
	if (!decision.limited) {
		return details;
	}

	ports.audit.log({
		action: input.action === 'create' ? 'member.invite_rate_limited' : 'member.invite_resend_rate_limited',
		resourceType: 'organization',
		details: {
			email: input.email,
			...(input.invitationId ? { invitationId: input.invitationId } : {}),
			rateLimit: details
		},
		severity: 'warning'
	});
	fail(429, organizationInvitationRateLimitMessage(input.action, decision.retryAfterMs));
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

async function notifyAdminsOfExpiredInvitation(
	ports: OrganizationSettingsMemberManagementPorts,
	input: { actorUserId: string; email: string | null }
): Promise<void> {
	try {
		await ports.notifications.notifyAdmins(ports.auth.orgId, input.actorUserId, {
			type: 'member_invite_expired',
			title: 'Invitation Expired',
			message: `"${input.email ?? 'An invitee'}" can no longer use the expired organization invitation.`,
			link: `/org/${ports.auth.orgId}/settings`
		});
	} catch (error) {
		console.error('[org-settings-member-management]', {
			status: 'expired-notification-failed',
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
		message: 'You can only leave organizations for your own account'
	});
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
