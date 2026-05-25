import { getAccessRequestHeardAboutLabel } from '$lib/accessRequests';
import type {
	AccountSetupLinkFailureReason,
	AccountSetupLinkRecord,
	AccountSetupLinkRevocationReason,
	CreateAccountSetupLinkResult
} from '$lib/server/accountSetupLinks';
import type { AuthEmailOutboxStatus, SendAccountSetupOutboxDeliveryResult } from '$lib/server/authEmailOutbox';
import type {
	BlockedOrganizationInvitation,
	RejectAccessRequestAndBlockInvitationsResult
} from '$lib/server/accessRequestInvitationBlocking';
import type { AccessRequestInvitationOrigin } from '$lib/server/accessRequestInvitationOrigin';
import { makePublicAppUrl } from '$lib/server/publicAppOrigin';
import {
	PLATFORM_ACCESS_REQUEST_APPROVE_ACTION,
	PLATFORM_ACCESS_REQUEST_REJECT_ACTION,
	PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION,
	sensitiveActionDecisionAuditDetails,
	sensitiveActionDenialMessage,
	sensitiveActionFailureFields,
	type SensitiveActionAuthorizer,
	type SensitiveActionFailureFields
} from '$lib/server/sensitiveActionAuthorizer';
import {
	platformAccessRequestRateLimitAuditDetails,
	platformAccessRequestRateLimitMessage,
	type PlatformAccessRequestRateLimitDecision,
	type PlatformAccessRequestSetupAction
} from '$lib/server/platformAccessRequestRateLimit';

export interface AccessRequestSetupLink {
	id: string;
	created_at: string;
	expires_at: string;
	claimed_at: string | null;
	failed_at: string | null;
	failure_reason: AccountSetupLinkFailureReason | null;
	used_at: string | null;
	revoked_at: string | null;
	revocation_reason: AccountSetupLinkRevocationReason | null;
}

export interface AccessRequestAuthEmailOutbox {
	id: string;
	setup_link_id: string;
	status: AuthEmailOutboxStatus;
	attempt_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	sent_at: string | null;
}

export interface PlatformAccessRequestAdminRow {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_details: string | null;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
	invitation_origins: AccessRequestInvitationOrigin[];
}

export type AccessRequestSetupState =
	| 'not_sent'
	| 'delivery_failed'
	| 'delivery_pending'
	| 'claimed'
	| 'pending'
	| 'expired'
	| 'replaced'
	| 'failed'
	| 'completed';

export interface PlatformAccessRequestAdminItem {
	id: string;
	name: string;
	email: string;
	reason: string | null;
	heard_about: string | null;
	heard_about_label: string | null;
	heard_about_details: string | null;
	status: 'pending' | 'approved' | 'rejected';
	created_at: string;
	reviewed_at: string | null;
	setup_completed_at: string | null;
	setup_state: AccessRequestSetupState;
	setup_state_label: string;
	setup_state_detail: string;
	setup_completed_at_display: string | null;
	setup_link_id: string | null;
	setup_link_created_at: string | null;
	setup_link_expires_at: string | null;
	setup_link_claimed_at: string | null;
	setup_link_failed_at: string | null;
	setup_link_failure_reason: AccountSetupLinkFailureReason | null;
	setup_link_replaced_at: string | null;
	setup_link_revocation_reason: AccountSetupLinkRevocationReason | null;
	has_replaced_setup_link: boolean;
	setup_delivery_id: string | null;
	setup_delivery_status: AuthEmailOutboxStatus | null;
	setup_delivery_attempt_count: number;
	setup_delivery_last_error: string | null;
	setup_delivery_updated_at: string | null;
	setup_delivery_sent_at: string | null;
	invitation_origins: AccessRequestInvitationOrigin[];
}

export interface PlatformAccessRequestAdminList {
	pending: PlatformAccessRequestAdminItem[];
	reviewed: PlatformAccessRequestAdminItem[];
}

export interface PlatformAccessRequestAdminCommandRow {
	id: string;
	email: string;
	status: 'pending' | 'approved' | 'rejected';
	setup_completed_at: string | null;
}

export interface PlatformAccessRequestAdminCommand {
	accessRequestId: string;
	actorUserId: string;
	publicOrigin: string;
}

export interface PlatformAccessRequestAdminRejectCommand {
	accessRequestId: string;
	actorUserId: string;
}

export type PlatformAccessRequestAdminSendResult =
	| { status: 'sent'; setupDeliveryStatus: 'sent' }
	| { status: 'delivery_failed'; setupDeliveryStatus: 'failed' }
	| { status: 'not_found' | 'already_reviewed' | 'not_approved' | 'setup_completed' | 'concurrent_create' }
	| { status: 'authorization_denied'; message: string; failure: SensitiveActionFailureFields }
	| { status: 'rate_limited'; message: string; retryAfterSeconds: number }
	| { status: 'failed' };

export type PlatformAccessRequestAdminRejectResult =
	| { status: 'rejected' }
	| { status: 'authorization_denied'; message: string; failure: SensitiveActionFailureFields }
	| { status: 'not_found' | 'already_reviewed' | 'failed' };

export interface PlatformAccessRequestAdministration {
	list(input?: { now?: Date }): Promise<PlatformAccessRequestAdminList>;
	approve(input: PlatformAccessRequestAdminCommand): Promise<PlatformAccessRequestAdminSendResult>;
	resendSetup(input: PlatformAccessRequestAdminCommand): Promise<PlatformAccessRequestAdminSendResult>;
	reject(input: PlatformAccessRequestAdminRejectCommand): Promise<PlatformAccessRequestAdminRejectResult>;
}

export interface PlatformAccessRequestAdministrationStore {
	listAccessRequests(): Promise<PlatformAccessRequestAdminRow[]>;
	getPendingAccessRequestForApproval(accessRequestId: string): Promise<PlatformAccessRequestAdminCommandRow | null>;
	markPendingRequestApproved(input: {
		accessRequestId: string;
		reviewerId: string;
		reviewedAt: Date;
	}): Promise<'approved' | 'not_found'>;
	getApprovedAccessRequestForResend(accessRequestId: string): Promise<PlatformAccessRequestAdminCommandRow | null>;
	rejectPendingAccessRequestAndBlockLinkedInvitations(
		input: PlatformAccessRequestAdminRejectCommand
	): Promise<RejectAccessRequestAndBlockInvitationsResult>;
}

export interface PlatformAccessRequestAdministrationAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: 'info' | 'warning' | 'critical';
}

interface AccountSetupLinkCreator {
	createForAccessRequest(accessRequestId: string): Promise<CreateAccountSetupLinkResult>;
}

interface PlatformAccessRequestSetupDelivery {
	send(input: {
		accessRequestId: string;
		setupLinkId: string;
		email: string;
		setupUrl: string;
		expiresAt: Date;
	}): Promise<SendAccountSetupOutboxDeliveryResult>;
}

interface PlatformAccessRequestGovernorNotifier {
	notifyInvitationBlocked(input: { organizationId: string; adminUserId: string; email: string }): Promise<void>;
}

export interface PlatformAccessRequestAdministrationDependencies {
	store: PlatformAccessRequestAdministrationStore;
	setupLinks: AccountSetupLinkCreator;
	setupDelivery: PlatformAccessRequestSetupDelivery;
	sensitiveActionAuthorizer: SensitiveActionAuthorizer;
	checkSetupRateLimit: (input: {
		action: PlatformAccessRequestSetupAction;
		adminUserId: string;
		accessRequestId: string;
	}) => Promise<PlatformAccessRequestRateLimitDecision>;
	audit: (event: PlatformAccessRequestAdministrationAuditEvent) => void;
	notifyGovernors: PlatformAccessRequestGovernorNotifier;
	now?: () => Date;
}

function normalizeSetupLinks(links: PlatformAccessRequestAdminRow['account_setup_links']): AccessRequestSetupLink[] {
	if (!links) return [];
	const normalized = Array.isArray(links) ? links : [links];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function normalizeOutboxRows(rows: PlatformAccessRequestAdminRow['auth_email_outbox']): AccessRequestAuthEmailOutbox[] {
	if (!rows) return [];
	const normalized = Array.isArray(rows) ? rows : [rows];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getRevokedSetupState(link: AccessRequestSetupLink): { label: string; detail: string } {
	switch (link.revocation_reason) {
		case 'manual':
			return {
				label: 'Revoked manually',
				detail: 'The latest known setup link was manually revoked. Send a fresh setup link if setup is still needed.'
			};
		case 'cleanup':
			return {
				label: 'Revoked by cleanup',
				detail:
					'The latest known setup link was revoked by cleanup after it expired. Send a fresh setup link if setup is still needed.'
			};
		case 'replaced':
		default:
			return {
				label: 'Replaced',
				detail: 'The latest known setup link was replaced by a newer setup email.'
			};
	}
}

function resolveSetupState(
	request: PlatformAccessRequestAdminRow,
	now: Date
): Omit<
	PlatformAccessRequestAdminItem,
	| 'id'
	| 'name'
	| 'email'
	| 'reason'
	| 'heard_about'
	| 'heard_about_label'
	| 'heard_about_details'
	| 'status'
	| 'created_at'
	| 'reviewed_at'
	| 'setup_completed_at'
	| 'invitation_origins'
> {
	const links = normalizeSetupLinks(request.account_setup_links);
	const deliveries = normalizeOutboxRows(request.auth_email_outbox);
	const latestLink = links[0] ?? null;
	const latestDelivery = latestLink
		? (deliveries.find((delivery) => delivery.setup_link_id === latestLink.id) ?? null)
		: (deliveries[0] ?? null);
	const hasReplacedSetupLink = links.some((link) => link.revoked_at && !link.used_at);
	const linkFields = {
		setup_link_id: latestLink?.id ?? null,
		setup_link_created_at: latestLink?.created_at ?? null,
		setup_link_expires_at: latestLink?.expires_at ?? null,
		setup_link_claimed_at: latestLink?.claimed_at ?? null,
		setup_link_failed_at: latestLink?.failed_at ?? null,
		setup_link_failure_reason: latestLink?.failure_reason ?? null,
		setup_link_replaced_at: latestLink?.revoked_at ?? null,
		setup_link_revocation_reason: latestLink?.revocation_reason ?? null
	};
	const deliveryFields = {
		setup_delivery_id: latestDelivery?.id ?? null,
		setup_delivery_status: latestDelivery?.status ?? null,
		setup_delivery_attempt_count: latestDelivery?.attempt_count ?? 0,
		setup_delivery_last_error: latestDelivery?.last_error ?? null,
		setup_delivery_updated_at: latestDelivery?.updated_at ?? null,
		setup_delivery_sent_at: latestDelivery?.sent_at ?? null
	};

	if (request.setup_completed_at || latestLink?.used_at) {
		const completedAt = request.setup_completed_at ?? latestLink?.used_at ?? null;
		return {
			setup_state: 'completed',
			setup_state_label: 'Completed',
			setup_state_detail: 'Account setup is complete. The user should sign in or reset their password if needed.',
			setup_completed_at_display: completedAt,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			setup_link_replaced_at: null,
			...deliveryFields
		};
	}

	if (!latestLink) {
		return {
			setup_state: 'not_sent',
			setup_state_label: 'Not sent',
			setup_state_detail: 'No account setup link has been sent yet.',
			setup_completed_at_display: null,
			has_replaced_setup_link: false,
			...linkFields,
			...deliveryFields
		};
	}

	if (latestLink.failed_at) {
		return {
			setup_state: 'failed',
			setup_state_label: 'Failed',
			setup_state_detail:
				'Setup failed after the link was claimed. The old link is no longer usable; send a fresh setup link.',
			setup_completed_at_display: null,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			...deliveryFields
		};
	}

	if (latestLink.claimed_at) {
		return {
			setup_state: 'claimed',
			setup_state_label: 'In progress',
			setup_state_detail:
				'The setup link has been claimed and cannot be used again. If setup does not complete, send a fresh setup link.',
			setup_completed_at_display: null,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			...deliveryFields
		};
	}

	if (latestLink.revoked_at) {
		const revokedState = getRevokedSetupState(latestLink);
		return {
			setup_state: 'replaced',
			setup_state_label: revokedState.label,
			setup_state_detail: revokedState.detail,
			setup_completed_at_display: null,
			has_replaced_setup_link: true,
			...linkFields,
			...deliveryFields
		};
	}

	if (new Date(latestLink.expires_at) <= now) {
		return {
			setup_state: 'expired',
			setup_state_label: 'Expired',
			setup_state_detail: 'The current setup link has expired. Resend setup to deliver a fresh link.',
			setup_completed_at_display: null,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			setup_link_replaced_at: null,
			...deliveryFields
		};
	}

	if (latestDelivery?.status === 'failed') {
		return {
			setup_state: 'delivery_failed',
			setup_state_label: 'Delivery failed',
			setup_state_detail: 'Setup email delivery failed. Send a fresh setup link to recover delivery.',
			setup_completed_at_display: null,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			...deliveryFields
		};
	}

	if (latestDelivery?.status === 'pending') {
		return {
			setup_state: 'delivery_pending',
			setup_state_label: 'Delivery pending',
			setup_state_detail: 'Setup email delivery is queued or in progress.',
			setup_completed_at_display: null,
			has_replaced_setup_link: hasReplacedSetupLink,
			...linkFields,
			...deliveryFields
		};
	}

	return {
		setup_state: 'pending',
		setup_state_label: 'Pending',
		setup_state_detail: 'A setup link is active and waiting for the recipient to finish account setup.',
		setup_completed_at_display: null,
		has_replaced_setup_link: hasReplacedSetupLink,
		...linkFields,
		setup_link_replaced_at: null,
		...deliveryFields
	};
}

function shapeListItem(request: PlatformAccessRequestAdminRow, now: Date): PlatformAccessRequestAdminItem {
	return {
		id: request.id,
		name: request.name,
		email: request.email,
		reason: request.reason,
		heard_about: request.heard_about,
		heard_about_label: getAccessRequestHeardAboutLabel(request.heard_about),
		heard_about_details: request.heard_about_details,
		status: request.status,
		created_at: request.created_at,
		reviewed_at: request.reviewed_at,
		setup_completed_at: request.setup_completed_at,
		invitation_origins: request.invitation_origins,
		...resolveSetupState(request, now)
	};
}

function mapSetupLinkResultToStatus(result: CreateAccountSetupLinkResult): PlatformAccessRequestAdminSendResult | null {
	switch (result.status) {
		case 'access-request-missing':
			return { status: 'not_found' };
		case 'access-request-not-approved':
			return { status: 'not_approved' };
		case 'access-request-completed':
			return { status: 'setup_completed' };
		case 'concurrent-create':
			return { status: 'concurrent_create' };
		case 'created':
			return null;
	}
}

function isCreatedSetupLinkResult(
	result: CreateAccountSetupLinkResult
): result is Extract<CreateAccountSetupLinkResult, { status: 'created' }> {
	return result.status === 'created';
}

function redactProviderError(error: unknown): string {
	const message =
		error instanceof Error && error.message
			? error.message
			: typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
				? error.message
				: 'Provider operation failed';

	return message
		.replace(/https?:\/\/[^\s"'<>]+\/auth\/setup-account\?token=[^\s"'<>]+/gi, '[redacted setup url]')
		.replace(/\btoken=[^&\s"'<>]+/gi, 'token=[redacted]')
		.replace(/\b[A-Fa-f0-9]{64}\b/g, '[redacted hash]');
}

function logProviderFailure(operation: string, error: unknown): void {
	console.error('[platform-access-request-administration]', {
		operation,
		error: redactProviderError(error)
	});
}

function auditRevokedSetupLinks(
	audit: PlatformAccessRequestAdministrationDependencies['audit'],
	input: { accessRequestId: string; replacementSetupLinkId: string; revokedLinks: AccountSetupLinkRecord[] }
): void {
	for (const revokedLink of input.revokedLinks) {
		audit({
			action: 'account_setup.link_revoked',
			resourceType: 'account_setup_link',
			resourceId: revokedLink.id,
			details: {
				accessRequestId: input.accessRequestId,
				replacementSetupLinkId: input.replacementSetupLinkId,
				stateTransition: 'pending.replaced'
			}
		});
	}
}

async function notifyGovernorsOfBlockedInvitations(input: {
	notifyGovernors: PlatformAccessRequestGovernorNotifier;
	adminUserId: string;
	blockedInvitations: BlockedOrganizationInvitation[];
}): Promise<void> {
	for (const invitation of input.blockedInvitations) {
		try {
			await input.notifyGovernors.notifyInvitationBlocked({
				organizationId: invitation.organizationId,
				adminUserId: input.adminUserId,
				email: invitation.email
			});
		} catch (error) {
			console.error('[platform-access-request-administration]', {
				status: 'blocked-invitation-notification-failed',
				organizationId: invitation.organizationId,
				email: invitation.email,
				error
			});
		}
	}
}

async function authorizeSetupSend(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		action: PlatformAccessRequestSetupAction;
		accessRequestId: string;
		actorUserId: string;
		email: string;
	}
): Promise<
	{ ok: true; sensitiveAction: Record<string, unknown> } | { ok: false; result: PlatformAccessRequestAdminSendResult }
> {
	const sensitiveAction =
		input.action === 'approval' ? PLATFORM_ACCESS_REQUEST_APPROVE_ACTION : PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION;
	const decision = await deps.sensitiveActionAuthorizer.authorize({
		action: sensitiveAction,
		actorUserId: input.actorUserId,
		target: { type: 'access_request', id: input.accessRequestId }
	});

	const details = sensitiveActionDecisionAuditDetails(decision);
	if (decision.allowed) {
		return { ok: true, sensitiveAction: details };
	}

	deps.audit({
		action:
			input.action === 'approval'
				? 'access_request.account_setup_approval_authorization_denied'
				: 'access_request.account_setup_resend_authorization_denied',
		resourceType: 'access_request',
		resourceId: input.accessRequestId,
		details: {
			email: input.email,
			sensitiveAction: details
		},
		severity: 'warning'
	});

	return {
		ok: false,
		result: {
			status: 'authorization_denied',
			message: sensitiveActionDenialMessage(decision),
			failure: sensitiveActionFailureFields(decision)
		}
	};
}

async function checkSetupSendRateLimit(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		action: PlatformAccessRequestSetupAction;
		accessRequestId: string;
		actorUserId: string;
		email: string;
	}
): Promise<
	{ ok: true; rateLimit: Record<string, unknown> } | { ok: false; result: PlatformAccessRequestAdminSendResult }
> {
	const decision = await deps.checkSetupRateLimit({
		action: input.action,
		adminUserId: input.actorUserId,
		accessRequestId: input.accessRequestId
	});
	const details = platformAccessRequestRateLimitAuditDetails(decision);
	if (decision.limited) {
		deps.audit({
			action:
				input.action === 'approval'
					? 'access_request.account_setup_approval_rate_limited'
					: 'access_request.account_setup_resend_rate_limited',
			resourceType: 'access_request',
			resourceId: input.accessRequestId,
			details: {
				email: input.email,
				rateLimit: details
			},
			severity: 'warning'
		});
		return {
			ok: false,
			result: {
				status: 'rate_limited',
				message: platformAccessRequestRateLimitMessage(input.action),
				retryAfterSeconds: Math.max(1, Math.ceil((decision.retryAfterMs ?? 0) / 1000))
			}
		};
	}

	return { ok: true, rateLimit: details };
}

async function createAndDeliverSetupLink(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		action: PlatformAccessRequestSetupAction;
		accessRequestId: string;
		email: string;
		publicOrigin: string;
		sensitiveAction: Record<string, unknown>;
		rateLimit: Record<string, unknown>;
	}
): Promise<PlatformAccessRequestAdminSendResult> {
	const setupResult = await deps.setupLinks.createForAccessRequest(input.accessRequestId);
	if (input.action === 'approval' && setupResult.status !== 'created' && setupResult.status !== 'concurrent-create') {
		return { status: 'failed' };
	}
	const failure = mapSetupLinkResultToStatus(setupResult);
	if (failure) return failure;
	if (!isCreatedSetupLinkResult(setupResult)) return { status: 'failed' };

	auditRevokedSetupLinks(deps.audit, {
		accessRequestId: input.accessRequestId,
		replacementSetupLinkId: setupResult.link.id,
		revokedLinks: setupResult.revokedLinks ?? []
	});

	const delivery = await deps.setupDelivery.send({
		accessRequestId: input.accessRequestId,
		setupLinkId: setupResult.link.id,
		email: input.email,
		setupUrl: makePublicAppUrl(setupResult.setupPath, { inboundOrigin: input.publicOrigin }),
		expiresAt: setupResult.expiresAt
	});

	const auditAction =
		input.action === 'approval'
			? delivery.status === 'sent'
				? 'access_request.account_setup_link_sent'
				: 'access_request.account_setup_link_delivery_failed'
			: delivery.status === 'sent'
				? 'access_request.account_setup_link_resent'
				: 'access_request.account_setup_link_delivery_failed';

	deps.audit({
		action: auditAction,
		resourceType: 'access_request',
		resourceId: input.accessRequestId,
		details: {
			email: input.email,
			setupLinkId: setupResult.link.id,
			outboxId: delivery.outbox.id,
			...(delivery.status === 'sent' ? { expiresAt: setupResult.expiresAt.toISOString() } : {}),
			sensitiveAction: input.sensitiveAction,
			rateLimit: input.rateLimit
		},
		severity: delivery.status === 'sent' ? 'info' : 'warning'
	});

	return delivery.status === 'sent'
		? { status: 'sent', setupDeliveryStatus: 'sent' }
		: { status: 'delivery_failed', setupDeliveryStatus: 'failed' };
}

async function authorizeReject(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		accessRequestId: string;
		actorUserId: string;
	}
): Promise<{ ok: true } | { ok: false; result: PlatformAccessRequestAdminRejectResult }> {
	const decision = await deps.sensitiveActionAuthorizer.authorize({
		action: PLATFORM_ACCESS_REQUEST_REJECT_ACTION,
		actorUserId: input.actorUserId,
		target: { type: 'access_request', id: input.accessRequestId }
	});

	const details = sensitiveActionDecisionAuditDetails(decision);
	if (decision.allowed) {
		return { ok: true };
	}

	deps.audit({
		action: 'access_request.rejection_authorization_denied',
		resourceType: 'access_request',
		resourceId: input.accessRequestId,
		details: {
			sensitiveAction: details
		},
		severity: 'warning'
	});

	return {
		ok: false,
		result: {
			status: 'authorization_denied',
			message: sensitiveActionDenialMessage(decision),
			failure: sensitiveActionFailureFields(decision)
		}
	};
}

export function createPlatformAccessRequestAdministration(
	deps: PlatformAccessRequestAdministrationDependencies
): PlatformAccessRequestAdministration {
	const now = deps.now ?? (() => new Date());

	return {
		async list(input = {}) {
			const requests = await deps.store.listAccessRequests();
			const referenceTime = input.now ?? now();
			const allRequests = requests.map((request) => shapeListItem(request, referenceTime));

			return {
				pending: allRequests.filter((request) => request.status === 'pending'),
				reviewed: allRequests.filter((request) => request.status !== 'pending')
			};
		},

		async approve(input) {
			try {
				const accessRequest = await deps.store.getPendingAccessRequestForApproval(input.accessRequestId);
				if (!accessRequest) return { status: 'already_reviewed' };

				const authorization = await authorizeSetupSend(deps, {
					action: 'approval',
					accessRequestId: input.accessRequestId,
					actorUserId: input.actorUserId,
					email: accessRequest.email
				});
				if (!authorization.ok) return authorization.result;

				const rateLimit = await checkSetupSendRateLimit(deps, {
					action: 'approval',
					accessRequestId: input.accessRequestId,
					actorUserId: input.actorUserId,
					email: accessRequest.email
				});
				if (!rateLimit.ok) return rateLimit.result;

				const approved = await deps.store.markPendingRequestApproved({
					accessRequestId: input.accessRequestId,
					reviewerId: input.actorUserId,
					reviewedAt: now()
				});
				if (approved !== 'approved') return { status: 'already_reviewed' };

				deps.audit({
					action: 'access_request.approved',
					resourceType: 'access_request',
					resourceId: input.accessRequestId,
					details: { email: accessRequest.email }
				});

				return createAndDeliverSetupLink(deps, {
					action: 'approval',
					accessRequestId: input.accessRequestId,
					email: accessRequest.email,
					publicOrigin: input.publicOrigin,
					sensitiveAction: authorization.sensitiveAction,
					rateLimit: rateLimit.rateLimit
				});
			} catch (error) {
				logProviderFailure('approve', error);
				return { status: 'failed' };
			}
		},

		async resendSetup(input) {
			try {
				const accessRequest = await deps.store.getApprovedAccessRequestForResend(input.accessRequestId);
				if (!accessRequest) return { status: 'not_approved' };

				const authorization = await authorizeSetupSend(deps, {
					action: 'resend',
					accessRequestId: input.accessRequestId,
					actorUserId: input.actorUserId,
					email: accessRequest.email
				});
				if (!authorization.ok) return authorization.result;

				if (accessRequest.setup_completed_at) return { status: 'setup_completed' };

				const rateLimit = await checkSetupSendRateLimit(deps, {
					action: 'resend',
					accessRequestId: input.accessRequestId,
					actorUserId: input.actorUserId,
					email: accessRequest.email
				});
				if (!rateLimit.ok) return rateLimit.result;

				return createAndDeliverSetupLink(deps, {
					action: 'resend',
					accessRequestId: input.accessRequestId,
					email: accessRequest.email,
					publicOrigin: input.publicOrigin,
					sensitiveAction: authorization.sensitiveAction,
					rateLimit: rateLimit.rateLimit
				});
			} catch (error) {
				logProviderFailure('resendSetup', error);
				return { status: 'failed' };
			}
		},

		async reject(input) {
			try {
				const authorization = await authorizeReject(deps, input);
				if (!authorization.ok) return authorization.result;

				const rejectResult = await deps.store.rejectPendingAccessRequestAndBlockLinkedInvitations(input);

				if (rejectResult.status === 'not_found') return { status: 'already_reviewed' };
				if (rejectResult.status === 'failed') return { status: 'failed' };

				deps.audit({
					action: 'access_request.rejected',
					resourceType: 'access_request',
					resourceId: input.accessRequestId,
					details: {
						blockedInvitationCount: rejectResult.blockedInvitations.length
					}
				});

				await notifyGovernorsOfBlockedInvitations({
					notifyGovernors: deps.notifyGovernors,
					adminUserId: input.actorUserId,
					blockedInvitations: rejectResult.blockedInvitations
				});

				return { status: 'rejected' };
			} catch (error) {
				logProviderFailure('reject', error);
				return { status: 'failed' };
			}
		}
	};
}
