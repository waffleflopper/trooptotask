import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { fail, RequestFailure } from '$lib/errors';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	defaultMemberAccessForRole,
	keepStoredLanes,
	memberAccessCommandToStorage,
	type EditableMembershipRole,
	type TargetMemberAccessCommand
} from '$lib/access/memberAccessCommands';
import { disabledFeatureLanes } from '$lib/access/featureSwitches';
import type { OrganizationFeatureSwitches } from '$lib/access/memberAccessProjection';
import {
	type CapabilityMap,
	type CapabilityOverrideMap,
	type OrganizationAccessGrant,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import {
	denyPolicyDecision,
	evaluateAuthoritativePolicyDecision,
	policyDenialAuditDetails,
	requireGovernancePolicy
} from '$lib/access/index.server';
import {
	createAccountSetupLinkIssuance,
	redactProviderError,
	type AccountSetupLinkIssuanceCreator,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkNotCreatedReason
} from '$features/identity/index.server';
import {
	ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION,
	ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION,
	ORGANIZATION_MEMBER_UPDATE_HIGH_PRIVILEGE_ACTION,
	type SensitiveAction,
	type SensitiveActionAuthorizer,
	type SensitiveActionDecision
} from '$features/identity/contracts';
import {
	parseUserProfileForm,
	sensitiveActionDecisionAuditDetails,
	throwSensitiveActionFailure
} from '$features/identity/index.server';
import { maskEmail } from '$lib/audit/index.server';
import {
	organizationInvitationRateLimitAuditDetails,
	organizationInvitationRateLimitMessage,
	type OrganizationInvitationRateLimitAction,
	type OrganizationInvitationRateLimiter
} from './invitationRateLimit.server';
import { validateEmail, validateUUID } from '$lib/server/validation';
import { MAX_INVITES_PER_SUBMISSION, parseInviteAddresses, type InviteAddressResult } from './inviteAddresses';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

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
	| { status: 'invitation-not-pending' }
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
	expectedRole: EditableMembershipRole;
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
	/** The levels on file, which a lane whose feature is off keeps through any save. */
	storedLevels: CapabilityMap;
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

export interface OrganizationMemberNameValues {
	rank: string | null;
	firstName: string | null;
	lastName: string | null;
}

export type OrganizationMemberNameWriteResult =
	| { status: 'saved'; userId: string; previous: OrganizationMemberNameValues; saved: OrganizationMemberNameValues }
	| { status: 'failed'; reason: 'denied' | 'not_found' | 'invalid' | 'error' };

export interface OrganizationSettingsMemberManagementPort {
	/** The given addresses that a live pending invitation in this Organization already covers. */
	findPendingInvitationEmails(orgId: string, emails: string[]): Promise<string[]>;
	findPendingInvitationById(orgId: string, inviteId: string): Promise<OrganizationInvitationResendLookupResult | null>;
	findUserAccountByEmail(email: string): Promise<{ id: string; email: string; emailConfirmed?: boolean } | null>;
	/** Creates the invitations in one write where it can, answering each input in order. */
	createInvitations(inputs: OrganizationInvitationCreateInput[]): Promise<OrganizationInvitationCreateResult[]>;
	createOrLinkApprovedAccessRequestForInvitation(
		input: OrganizationInvitationAccessRequestBridgeInput
	): Promise<OrganizationInvitationAccessRequestBridgeResult>;
	blockInvitationAfterAccessRequestBridgeFailure(input: {
		organizationId: string;
		invitationId: string;
		blockedBy: string;
		reason: string;
	}): Promise<{ status: 'blocked' } | { status: 'not-pending' } | { status: 'failed'; message: string }>;
	revokeInvitation(orgId: string, inviteId: string): Promise<OrganizationInvitationRevokeResult>;
	findMembershipById(orgId: string, membershipId: string): Promise<OrganizationMembershipRecord | null>;
	removeMembership(orgId: string, membershipId: string, expectedRole: EditableMembershipRole): Promise<string | null>;
	updateMembership(input: OrganizationMembershipUpdateInput): Promise<string | null>;
	setMemberName(input: {
		organizationId: string;
		userId: string;
		rank: string;
		firstName: string;
		lastName: string;
	}): Promise<OrganizationMemberNameWriteResult>;
	getOrganizationName(orgId: string): Promise<string | null>;
	findOrganizationGroups(orgId: string, groupIds: string[]): Promise<Array<{ id: string; name: string }>>;
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
	}): Promise<
		| { status: 'sent'; outbox: { id: string } }
		| { status: 'failed' | 'sent_recording_failed'; outbox: { id: string }; error: string }
	>;
}

interface OrganizationSettingsMemberManagementPorts {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	notifications: NotificationDeliveryPort;

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

interface InviteOrganizationMembersInput {
	/** The pasted addresses, separated by commas, semicolons, spaces or line breaks. */
	emails: string;
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

interface SetOrganizationMemberNameInput {
	membershipId: string;
	rank: unknown;
	firstName: unknown;
	lastName: unknown;
	/** The ranks the name form accepts, which the route supplies from the Personnel rank list. */
	allowedRanks: readonly string[];
}

interface UpdateOrganizationMemberAccessInput {
	membershipId: string;
	membershipRole: EditableMembershipRole;
	memberAccess?: TargetMemberAccessCommand | null;
	actorEmail?: string | null;
}

export async function inviteOrganizationMembers(
	ports: InviteOrganizationMemberPorts,
	input: InviteOrganizationMembersInput
): Promise<{
	inviteSuccess: true;
	inviteResults: InviteAddressResult[];
	inviteMessage: string;
}> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.inviteMember);
	const membershipRole = input.membershipRole ?? 'member';
	if (membershipRole === 'admin') {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	}

	const actorUserId = requireActorUserId(ports.auth);
	const addresses = parseInviteAddresses(input.emails);
	if (addresses.length === 0) {
		fail(400, 'Enter at least one email address');
	}
	if (addresses.length > MAX_INVITES_PER_SUBMISSION) {
		fail(400, `Invite up to ${MAX_INVITES_PER_SUBMISSION} addresses at a time`);
	}

	const results = new Map<string, InviteAddressResult>();
	const outcome = () => inviteOutcome(addresses, results);
	const valid = addresses.filter((email) => {
		if (validateEmail(email)) return true;
		results.set(email, { email, status: 'failed', message: 'Not a valid email address.' });
		return false;
	});
	if (valid.length === 0) return outcome();

	const accessCommand = memberAccessCommandToStorage({
		membershipRole,
		memberAccess: input.memberAccess
	});
	await requireOrganizationGroups(ports, accessCommand.accessScopeGroupIds);

	if (isHighPrivilegeAccess(accessCommand.role, false))
		await authorizeMemberManagementSensitiveAction(ports, {
			action: ORGANIZATION_MEMBER_INVITE_HIGH_PRIVILEGE_ACTION,
			deniedAuditAction: 'member.high_privilege_invite_authorization_denied',
			targetId: valid.join(','),
			targetType: 'organization_invitation',
			details: {
				emails: valid,
				membershipRole: accessCommand.role,
				memberPreset: accessCommand.memberPreset
			}
		});

	const pending = new Set(await ports.settings.findPendingInvitationEmails(ports.auth.orgId, valid));
	for (const email of pending) {
		results.set(email, {
			email,
			status: 'already-invited',
			message: 'Already invited. Resend it from Waiting on them.'
		});
	}

	const recipients = await settleEachAddress(
		valid.filter((email) => !pending.has(email)),
		results,
		async (email) => ({
			email,
			account: await ports.settings.findUserAccountByEmail(email),
			rateLimit: await checkInvitationRateLimit(ports, { action: 'create', actorUserId, email })
		})
	);
	if (recipients.length === 0) return outcome();

	const created = await ports.settings.createInvitations(
		recipients.map(({ email }) => ({
			organizationId: ports.auth.orgId,
			email,
			invitedBy: actorUserId,
			role: accessCommand.role,
			memberPreset: accessCommand.memberPreset,
			capabilityOverrides: accessCommand.capabilityOverrides,
			accessScopeKind: accessCommand.accessScopeKind,
			accessScopeGroupIds: accessCommand.accessScopeGroupIds
		}))
	);
	const invitations = recipients.flatMap((recipient, index) => {
		const result = created[index];
		if (result?.status === 'created') return [{ ...recipient, ...result }];
		console.error('[org-settings-member-management]', {
			status: 'invitation-create-failed',
			organizationId: ports.auth.orgId,
			error: result?.message ?? 'missing create result'
		});
		results.set(recipient.email, { email: recipient.email, status: 'failed', message: ADDRESS_FAILED_MESSAGE });
		return [];
	});
	if (invitations.length === 0) return outcome();

	const organizationName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'your organization';
	const delivered = await settleEachAddress(invitations, results, (invitation) =>
		completeInvitation(ports, {
			...invitation,
			actorUserId,
			actorEmail: input.actorEmail ?? null,
			origin: input.origin ?? '',
			organizationName,
			accessCommand
		})
	);
	for (const result of delivered) results.set(result.email, result);

	const emails = addresses.filter((email) => results.get(email)?.status === 'invited');
	if (emails.length > 0) {
		try {
			await ports.notifications.notifyAdmins(ports.auth.orgId, actorUserId, {
				type: 'member_invited',
				title: emails.length === 1 ? 'Member Invited' : 'Members Invited',
				message:
					emails.length === 1
						? `"${input.actorEmail ?? ''}" invited "${emails[0]}" to the organization.`
						: `"${input.actorEmail ?? ''}" invited ${emails.length} people to the organization: ${emails.join(', ')}.`,
				link: `/org/${ports.auth.orgId}/settings/general`
			});
		} catch (error) {
			// The invitations already exist, so the admin still needs each address's result.
			console.error('[org-settings-member-management]', {
				status: 'invited-notification-failed',
				organizationId: ports.auth.orgId,
				error: sanitizeErrorForLog(error)
			});
		}
	}

	return outcome();
}

const ADDRESS_FAILED_MESSAGE = "This invitation couldn't be created. Try again.";
// Bounds the per-address lookups and follow-ups a submission runs at once.
const ADDRESS_CONCURRENCY = 5;

/**
 * Runs `work` for each item, a few at a time. A failure becomes that address's result and drops it from the
 * returned values, so one address never stops the rest.
 */
async function settleEachAddress<T extends string | { email: string }, R>(
	items: readonly T[],
	results: Map<string, InviteAddressResult>,
	work: (item: T) => Promise<R>
): Promise<R[]> {
	const settled: R[] = [];
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++];
			try {
				settled.push(await work(item));
			} catch (error) {
				const email = typeof item === 'string' ? item : item.email;
				results.set(email, { email, status: 'failed', message: addressFailureMessage(error) });
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(ADDRESS_CONCURRENCY, items.length) }, worker));
	return settled;
}

function addressFailureMessage(error: unknown): string {
	if (error instanceof RequestFailure && (error.status < 500 || error.publicMessage)) return error.message;
	console.error('[org-settings-member-management]', {
		status: 'invitation-address-failed',
		error: sanitizeErrorForLog(error)
	});
	return ADDRESS_FAILED_MESSAGE;
}

function inviteOutcome(
	addresses: readonly string[],
	results: ReadonlyMap<string, InviteAddressResult>
): { inviteSuccess: true; inviteResults: InviteAddressResult[]; inviteMessage: string } {
	const inviteResults = addresses.map(
		(email) => results.get(email) ?? { email, status: 'failed' as const, message: ADDRESS_FAILED_MESSAGE }
	);
	const count = (status: InviteAddressResult['status']) => inviteResults.filter((r) => r.status === status).length;
	const inviteMessage =
		inviteResults.length === 1
			? inviteResults[0].message
			: [
					[count('invited'), 'invited'],
					[count('already-invited'), 'already invited'],
					[count('failed'), 'not invited']
				]
					.filter(([n]) => n)
					.map(([n, label]) => `${n} ${label}.`)
					.join(' ');
	return { inviteSuccess: true, inviteResults, inviteMessage };
}

/** Everything one created invitation still needs: platform access setup, its audit row, notices and its email. */
async function completeInvitation(
	ports: InviteOrganizationMemberPorts,
	invitation: {
		email: string;
		invitationId: string;
		createdAt: string;
		account: { id: string } | null;
		rateLimit: Record<string, unknown> | null;
		actorUserId: string;
		actorEmail: string | null;
		origin: string;
		organizationName: string;
		accessCommand: ReturnType<typeof memberAccessCommandToStorage>;
	}
): Promise<InviteAddressResult> {
	const { email, invitationId, account, accessCommand } = invitation;
	if (!account) {
		const bridge = await bridgeInvitationToAccessRequest(ports, {
			organizationId: ports.auth.orgId,
			invitationId,
			email,
			invitedBy: invitation.actorUserId,
			invitedAt: invitation.createdAt,
			role: accessCommand.role,
			memberPreset: accessCommand.memberPreset,
			capabilityOverrides: accessCommand.capabilityOverrides,
			accessScopeKind: accessCommand.accessScopeKind,
			accessScopeGroupIds: accessCommand.accessScopeGroupIds
		});
		if (bridge.status === 'invitation-not-pending') {
			fail(
				409,
				'The invitation was withdrawn or expired before platform access setup could be linked. Send a new invitation.'
			);
		}
		await issueInvitationAccountSetupLink(ports, {
			accessRequestId: bridge.accessRequestId,
			organizationId: ports.auth.orgId,
			invitationId,
			email,
			invitedBy: invitation.actorUserId,
			publicOrigin: invitation.origin
		});
	}

	await ports.audit.log({
		action: 'member.invite',
		resourceType: 'organization',
		record: maskEmail(email),
		details: { role: accessCommand.role }
	});

	if (account) {
		await notifyInvitedAccount(ports, {
			userId: account.id,
			invitationId,
			organizationName: invitation.organizationName
		});
	}

	const deliveryStatus = await deliverInvitationEmail(ports, {
		invitationId,
		email,
		actorEmail: invitation.actorEmail,
		origin: invitation.origin,
		requiresAccountSetup: !account,
		organizationName: invitation.organizationName,
		mode: 'initial',
		rateLimit: invitation.rateLimit
	});

	return {
		email,
		status: 'invited',
		message:
			deliveryStatus === 'failed'
				? 'Invited, but the email failed. Resend it from Waiting on them.'
				: deliveryStatus === 'sent'
					? 'Invited. The email is on its way.'
					: 'Invited. Tell them to sign in to Troop to Task to see it.'
	};
}

/** One in-app notice per created invitation, in the bell of every Organization the person opens. */
async function notifyInvitedAccount(
	ports: OrganizationSettingsMemberManagementPorts,
	input: { userId: string; invitationId: string; organizationName: string }
): Promise<void> {
	try {
		await ports.notifications.notifyUser(null, input.userId, {
			type: 'organization_invitation_received',
			title: `Invitation to join ${input.organizationName}`,
			message: `You've been invited to join ${input.organizationName}. Open your invitations to accept or decline.`,
			link: '/dashboard?show=all'
		});
	} catch (error) {
		console.error('[org-settings-member-management]', {
			status: 'invitation-received-notification-failed',
			organizationId: ports.auth.orgId,
			invitationId: input.invitationId,
			error: sanitizeErrorForLog(error)
		});
	}
}

async function bridgeInvitationToAccessRequest(
	ports: OrganizationSettingsMemberManagementPorts,
	input: OrganizationInvitationAccessRequestBridgeInput
): Promise<
	{ status: 'created' | 'linked' | 'already-linked'; accessRequestId: string } | { status: 'invitation-not-pending' }
> {
	const result = await ports.settings.createOrLinkApprovedAccessRequestForInvitation(input);
	if (result.status === 'invitation-not-pending') {
		await ports.audit.log({
			action: 'member.invite_access_request_link_failed',
			resourceType: 'organization',
			details: { email: input.email, invitationId: input.invitationId, reason: result.status, blocked: false },
			severity: 'warning'
		});
		return { status: 'invitation-not-pending' };
	}
	if (result.status === 'failed') {
		return blockInvitationAndFail(ports, {
			organizationId: input.organizationId,
			invitationId: input.invitationId,
			blockedBy: input.invitedBy,
			email: input.email,
			reason: result.message,
			failureAction: 'member.invite_access_request_link_failed',
			blockFailureAction: 'member.invite_access_request_link_block_failed',
			publicMessages: {
				blocked: 'Invitation could not be created because platform access setup could not be linked',
				failed:
					'Platform access setup could not be linked. Check Waiting on them and revoke the invitation if it is still listed.'
			}
		});
	}

	await ports.audit.log({
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
 * Blocks the just-created invitation, records why, and fails the invite with copy that
 * matches what the block left behind. Shared by the two ways platform access setup can
 * leave an invitation stranded: the Access Request bridge failing, and the setup link
 * failing to be created.
 */
async function blockInvitationAndFail(
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
		publicMessages: { blocked: string; failed: string };
	}
): Promise<never> {
	const blockResult = await ports.settings.blockInvitationAfterAccessRequestBridgeFailure({
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		blockedBy: input.blockedBy,
		reason: input.reason
	});

	await ports.audit.log({
		action: input.failureAction,
		resourceType: 'organization',
		details: {
			email: input.email,
			invitationId: input.invitationId,
			...(input.failureDetails ?? { reason: input.reason }),
			blocked: blockResult.status === 'blocked'
		},
		severity: blockResult.status === 'failed' ? 'critical' : 'warning'
	});

	if (blockResult.status === 'failed') {
		await ports.audit.log({
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

	if (blockResult.status === 'not-pending') {
		fail(409, 'This invitation was withdrawn while it was being created.');
	}
	fail(500, input.publicMessages[blockResult.status], { publicMessage: true });
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
		await ports.audit.log({
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

	await blockInvitationAndFail(ports, {
		organizationId: input.organizationId,
		invitationId: input.invitationId,
		blockedBy: input.invitedBy,
		email: input.email,
		reason: notCreatedReason,
		failureAction: 'member.invite_account_setup_link_not_created',
		blockFailureAction: 'member.invite_account_setup_link_block_failed',
		failureDetails: { accessRequestId: input.accessRequestId, reason: notCreatedReason },
		publicMessages: {
			blocked: 'Invitation could not be created because the account setup link could not be issued',
			failed:
				'The account setup link could not be issued. Check Waiting on them and revoke the invitation if it is still listed.'
		}
	});
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

	const organizationName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'your organization';
	const deliveryStatus = await deliverInvitationEmail(ports, {
		invitationId: invitation.id,
		email: invitation.email,
		actorEmail: input.actorEmail ?? null,
		origin: input.origin,
		requiresAccountSetup: invitation.requiresAccountSetup,
		requiresAccessRequest,
		organizationName,
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
		organizationName: string;
		mode: 'initial' | 'resend';
		rateLimit?: Record<string, unknown> | null;
	}
): Promise<'sent' | 'failed' | 'not_configured'> {
	if (!ports.invitationDelivery || !input.origin) {
		return 'not_configured';
	}

	let delivery: Awaited<ReturnType<OrganizationInvitationDeliveryPort['sendInvitationEmail']>>;
	try {
		delivery = await ports.invitationDelivery.sendInvitationEmail({
			organizationId: ports.auth.orgId,
			invitationId: input.invitationId,
			email: input.email,
			organizationName: input.organizationName,
			invitedByEmail: input.actorEmail,
			origin: input.origin,
			requiresAccountSetup: input.requiresAccountSetup,
			requiresAccessRequest: input.requiresAccessRequest
		});
	} catch (error) {
		await ports.audit.log({
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
			error: sanitizeErrorForLog(error)
		});
		return 'failed';
	}

	await ports.audit.log({
		action:
			delivery.status !== 'failed'
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
			...(delivery.status === 'sent_recording_failed' ? { recordingFailed: true } : {}),
			deliveryMode: input.mode,
			...(input.rateLimit ? { rateLimit: input.rateLimit } : {})
		},
		severity: delivery.status === 'sent' ? 'info' : 'warning'
	});

	return delivery.status === 'sent_recording_failed' ? 'sent' : delivery.status;
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

	await ports.audit.log({
		action: 'member.invite_revoked',
		resourceType: 'organization',
		resourceId: input.inviteId,
		record: revoked.email ? maskEmail(revoked.email) : 'an invitation',
		details: {}
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
	if (!membership) {
		fail(404, 'Membership not found');
	}

	if (membership?.userId === actorUserId) {
		fail(400, 'You cannot remove yourself from the organization');
	}

	if (membership?.role === 'owner') {
		fail(400, 'Cannot remove the organization owner');
	}
	const expectedRole = requireEditableMembershipRole(membership.role);
	if (membership.role === 'admin') {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	}
	const removesHighPrivilegeMember = isHighPrivilegeAccess(membership?.role, membership?.canManageMembers);
	if (removesHighPrivilegeMember)
		await authorizeMemberManagementSensitiveAction(ports, {
			action: ORGANIZATION_MEMBER_REMOVE_HIGH_PRIVILEGE_ACTION,
			deniedAuditAction: 'member.high_privilege_remove_authorization_denied',
			targetId: input.membershipId,
			targetType: 'organization_membership',
			details: {
				membershipId: input.membershipId,
				targetRole: membership?.role ?? null,
				targetCanManageMembers: membership?.canManageMembers ?? null
			}
		});

	const errorMessage = await ports.settings.removeMembership(ports.auth.orgId, input.membershipId, expectedRole);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	await ports.audit.log({
		action: 'member.removed',
		resourceType: 'organization',
		resourceId: input.membershipId,
		record: membership.email ? maskEmail(membership.email) : 'a member',
		details: {}
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
			link: `/org/${ports.auth.orgId}/settings/general`
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

	await requireIdentityPolicy(ports, membership?.userId ?? null);

	if (membership?.role === 'owner') {
		fail(400, 'Organization owners must transfer ownership before leaving the organization');
	}
	const expectedRole = requireEditableMembershipRole(membership?.role);

	const errorMessage = await ports.settings.removeMembership(ports.auth.orgId, input.membershipId, expectedRole);
	if (errorMessage) {
		fail(500, errorMessage);
	}

	await ports.audit.log({
		action: 'member.left',
		resourceType: 'organization',
		resourceId: input.membershipId,
		details: {}
	});

	const orgName = (await ports.settings.getOrganizationName(ports.auth.orgId)) ?? 'the organization';
	await ports.notifications.notifyAdmins(ports.auth.orgId, actorUserId, {
		type: 'member_left',
		title: 'Member Left Organization',
		message: `"${input.actorEmail ?? ''}" left "${orgName}".`,
		link: `/org/${ports.auth.orgId}/settings/general`
	});

	return { success: true };
}

export async function updateOrganizationMemberAccess(
	ports: OrganizationSettingsMemberManagementPorts & OrganizationFeatureSwitches,
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
	const expectedRole = requireEditableMembershipRole(targetMembership.role);

	const updatesAdminRole = input.membershipRole === 'admin' || targetMembership?.role === 'admin';
	if (updatesAdminRole) {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateAdminAccess);
	} else {
		await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateMemberAccess);
	}

	const requestedAccess =
		input.memberAccess ?? (input.membershipRole === 'admin' ? defaultMemberAccessForRole('admin') : null);
	const accessCommand = memberAccessCommandToStorage({
		membershipRole: input.membershipRole,
		memberAccess:
			requestedAccess &&
			keepStoredLanes(requestedAccess, targetMembership.storedLevels, disabledFeatureLanes(ports.disabledFeatures))
	});
	const groupNames = await requireOrganizationGroups(ports, accessCommand.accessScopeGroupIds);
	const updatesHighPrivilegeAccess =
		isHighPrivilegeAccess(targetMembership?.role, targetMembership?.canManageMembers) ||
		isHighPrivilegeAccess(accessCommand.role, false);
	if (updatesHighPrivilegeAccess)
		await authorizeMemberManagementSensitiveAction(ports, {
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
		});

	const errorMessage = await ports.settings.updateMembership({
		organizationId: ports.auth.orgId,
		membershipId: input.membershipId,
		expectedRole,
		role: accessCommand.role,
		memberPreset: accessCommand.memberPreset,
		capabilityOverrides: accessCommand.capabilityOverrides,
		accessScopeKind: accessCommand.accessScopeKind,
		accessScopeGroupIds: accessCommand.accessScopeGroupIds
	});

	if (errorMessage) {
		fail(500, errorMessage);
	}

	await ports.audit.log({
		action: 'member.access_changed',
		resourceType: 'organization',
		resourceId: input.membershipId,
		record: targetMembership.email ? maskEmail(targetMembership.email) : 'a member',
		details: {
			role: accessCommand.role,
			preset: accessCommand.memberPreset,
			scope: accessCommand.accessScopeKind,
			groups: groupNames,
			capabilities: accessCommand.capabilityOverrides
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

const MEMBER_NAME_FAILURES = {
	denied: [403, 'Only an organization owner or admin can set a member name'],
	not_found: [404, 'Membership not found'],
	invalid: [400, 'Enter a valid rank, first name and last name'],
	error: [500, 'Member name could not be saved']
} as const;

/** The name an owner or admin gives a member whose own account has none. The member's account name still outranks it on display. */
export async function setOrganizationMemberName(
	ports: OrganizationSettingsMemberManagementPorts,
	input: SetOrganizationMemberNameInput
): Promise<{ nameSuccess: true; nameMembershipId: string }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateMemberName);

	if (!validateUUID(input.membershipId)) {
		fail(400, 'Invalid membership ID');
	}
	const name = parseUserProfileForm(
		{ firstName: input.firstName, lastName: input.lastName, rank: input.rank },
		input.allowedRanks
	);
	if ('error' in name) {
		fail(400, name.error);
	}

	const membership = await ports.settings.findMembershipById(ports.auth.orgId, input.membershipId);
	if (!membership?.userId) {
		fail(404, 'Membership not found');
	}

	const result = await ports.settings.setMemberName({
		organizationId: ports.auth.orgId,
		userId: membership.userId,
		rank: name.rank,
		firstName: name.firstName,
		lastName: name.lastName
	});
	if (result.status === 'failed') {
		const [status, message] = MEMBER_NAME_FAILURES[result.reason];
		fail(status, message, { publicMessage: true });
	}
	if (
		result.userId !== membership.userId ||
		result.saved.rank !== name.rank ||
		result.saved.firstName !== name.firstName ||
		result.saved.lastName !== name.lastName
	) {
		fail(500, 'Unable to confirm member name save');
	}

	await ports.audit.log({
		action: 'member.name_changed',
		resourceType: 'organization',
		resourceId: input.membershipId,
		record: membership.email ? maskEmail(membership.email) : 'a member',
		details: { before: result.previous, after: result.saved }
	});

	return { nameSuccess: true, nameMembershipId: input.membershipId };
}

function requireEditableMembershipRole(role: unknown): EditableMembershipRole {
	if (role !== 'member' && role !== 'admin') {
		fail(500, 'Membership role could not be verified');
	}
	return role;
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
		await auditDeniedSensitiveAction(ports, input.deniedAuditAction, decision, input.details);
		throwSensitiveActionFailure(decision);
	}

	return decision;
}

async function auditDeniedSensitiveAction(
	ports: Pick<OrganizationSettingsMemberManagementPorts, 'audit'>,
	action: string,
	decision: SensitiveActionDecision,
	details: Record<string, unknown> | undefined
): Promise<void> {
	await ports.audit.log({
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

async function requireOrganizationGroups(
	ports: OrganizationSettingsMemberManagementPorts,
	groupIds: string[]
): Promise<string[]> {
	if (groupIds.length === 0) return [];
	const found = new Map(
		(await ports.settings.findOrganizationGroups(ports.auth.orgId, groupIds)).map((group) => [group.id, group.name])
	);
	const names = groupIds.map((id) => found.get(id));
	if (names.some((name) => name === undefined)) {
		fail(400, 'Select groups from this organization');
	}
	return names as string[];
}

function isHighPrivilegeAccess(role: string | null | undefined, canManageMembers: boolean | null | undefined): boolean {
	return role === 'owner' || role === 'admin' || canManageMembers === true;
}

function requireActorUserId(auth: OrganizationAccessGrant): string {
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

	await ports.audit.log({
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
			link: `/org/${ports.auth.orgId}/settings/general`
		});
	} catch (error) {
		console.error('[org-settings-member-management]', {
			status: 'revoked-notification-failed',
			organizationId: ports.auth.orgId,
			userId: input.actorUserId,
			error: sanitizeErrorForLog(error)
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
			link: `/org/${ports.auth.orgId}/settings/general`
		});
	} catch (error) {
		console.error('[org-settings-member-management]', {
			status: 'expired-notification-failed',
			organizationId: ports.auth.orgId,
			userId: input.actorUserId,
			error: sanitizeErrorForLog(error)
		});
	}
}

async function requireIdentityPolicy(
	ports: OrganizationSettingsMemberManagementPorts,
	resourceUserId: string | null
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		POLICY_ACTION_CATALOG.identity.leaveOrganization,
		resourceUserId ? { kind: 'user', userId: resourceUserId } : { kind: 'unscoped' }
	);

	if (decision.allowed) {
		return;
	}

	await denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: 'organization',
		details: policyDenialAuditDetails(decision),
		message: 'You can only leave organizations for your own account'
	});
}
