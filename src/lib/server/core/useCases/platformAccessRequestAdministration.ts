import { getAccessRequestHeardAboutLabel } from '$lib/accessRequests';
import type { AccountSetupLinkFailureReason, AccountSetupLinkRevocationReason } from '$lib/server/accountSetupLinks';
import type { AuthEmailOutboxStatus } from '$lib/server/authEmailOutbox';
import {
	classifyAccessRequestSetupState,
	findLatestAccessRequestSetupDelivery,
	normalizeAccessRequestSetupDeliveries,
	normalizeAccessRequestSetupLinks,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type AccessRequestSetupState
} from '$lib/server/accessRequestSetupState';
import type {
	BlockedOrganizationInvitation,
	RejectAccessRequestAndBlockInvitationsResult
} from '$lib/server/accessRequestInvitationBlocking';
import type { AccessRequestInvitationOrigin } from '$lib/server/accessRequestInvitationOrigin';
import {
	createAccountSetupLinkIssuance,
	redactProviderError,
	type AccountSetupLinkIssuanceCreator,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkIssuanceOrigin,
	type AccountSetupLinkIssuanceResult,
	type AccountSetupLinkNotCreatedReason
} from '$lib/server/accountSetupLinkIssuance';
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

export type { AccessRequestAuthEmailOutbox, AccessRequestSetupLink, AccessRequestSetupState };

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
	reviewed_by: string | null;
	setup_completed_at: string | null;
	account_setup_links: AccessRequestSetupLink | AccessRequestSetupLink[] | null;
	auth_email_outbox: AccessRequestAuthEmailOutbox | AccessRequestAuthEmailOutbox[] | null;
	invitation_origins: AccessRequestInvitationOrigin[];
}

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
	auto_approved: boolean;
	auto_approval_detail: string | null;
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

interface PlatformAccessRequestGovernorNotifier {
	notifyInvitationBlocked(input: { organizationId: string; adminUserId: string; email: string }): Promise<void>;
}

export interface PlatformAccessRequestAdministrationDependencies {
	store: PlatformAccessRequestAdministrationStore;
	setupLinks: AccountSetupLinkIssuanceCreator;
	setupDelivery: AccountSetupLinkIssuanceDelivery;
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
	| 'auto_approved'
	| 'auto_approval_detail'
> {
	const links = normalizeAccessRequestSetupLinks(request.account_setup_links);
	const deliveries = normalizeAccessRequestSetupDeliveries(request.auth_email_outbox);
	const latestLink = links[0] ?? null;
	const latestDelivery = findLatestAccessRequestSetupDelivery(links, deliveries);
	const setupState = classifyAccessRequestSetupState({
		setupCompletedAt: request.setup_completed_at,
		latestLink,
		latestDelivery,
		now
	});
	const copy = getSetupStateCopy(setupState, latestLink);

	return {
		setup_state: setupState,
		setup_state_label: copy.label,
		setup_state_detail: copy.detail,
		setup_completed_at_display:
			setupState === 'completed' ? (request.setup_completed_at ?? latestLink?.used_at ?? null) : null,
		has_replaced_setup_link: links.some((link) => link.revoked_at && !link.used_at),
		setup_link_id: latestLink?.id ?? null,
		setup_link_created_at: latestLink?.created_at ?? null,
		setup_link_expires_at: latestLink?.expires_at ?? null,
		setup_link_claimed_at: latestLink?.claimed_at ?? null,
		setup_link_failed_at: latestLink?.failed_at ?? null,
		setup_link_failure_reason: latestLink?.failure_reason ?? null,
		// A completed setup's link was used, not replaced, even if it also carries a revocation stamp.
		setup_link_replaced_at: setupState === 'completed' ? null : (latestLink?.revoked_at ?? null),
		setup_link_revocation_reason: latestLink?.revocation_reason ?? null,
		setup_delivery_id: latestDelivery?.id ?? null,
		setup_delivery_status: latestDelivery?.status ?? null,
		setup_delivery_attempt_count: latestDelivery?.attempt_count ?? 0,
		setup_delivery_last_error:
			latestDelivery?.last_error == null ? null : redactProviderError(latestDelivery.last_error),
		setup_delivery_updated_at: latestDelivery?.updated_at ?? null,
		setup_delivery_sent_at: latestDelivery?.sent_at ?? null
	};
}

function getSetupStateCopy(
	setupState: AccessRequestSetupState,
	latestLink: AccessRequestSetupLink | null
): { label: string; detail: string } {
	switch (setupState) {
		case 'completed':
			return {
				label: 'Completed',
				detail: 'Account setup is complete. The user should sign in or reset their password if needed.'
			};
		case 'not_sent':
			return { label: 'Not sent', detail: 'No account setup link has been sent yet.' };
		case 'failed':
			return {
				label: 'Failed',
				detail: 'Setup failed after the link was claimed. The old link is no longer usable; send a fresh setup link.'
			};
		case 'claimed':
			return {
				label: 'In progress',
				detail:
					'The setup link has been claimed and cannot be used again. If setup does not complete, send a fresh setup link.'
			};
		case 'replaced':
			return latestLink
				? getRevokedSetupState(latestLink)
				: { label: 'Replaced', detail: 'The latest known setup link was replaced by a newer setup email.' };
		case 'expired':
			return {
				label: 'Expired',
				detail: 'The current setup link has expired. Resend setup to deliver a fresh link.'
			};
		case 'delivery_failed':
			return {
				label: 'Delivery failed',
				detail: 'Setup email delivery failed. Send a fresh setup link to recover delivery.'
			};
		case 'delivery_pending':
			return { label: 'Delivery pending', detail: 'Setup email delivery is queued or in progress.' };
		case 'pending':
			return {
				label: 'Pending',
				detail: 'A setup link is active and waiting for the recipient to finish account setup.'
			};
	}
}

/**
 * The invitation origin that actually did the approving.
 *
 * One person can invite the same address from two Organizations, and both origins then match
 * `reviewed_by`. Only the invite that found the request `pending` approved it: the approving
 * update is `WHERE status = 'pending'`, so later invites reuse an already-approved row and leave
 * the reviewer and review timestamp alone. The approving origin is therefore the most recent one
 * that pre-dates the review, not simply the most recent one.
 *
 * `invited_at` and `reviewed_at` come from different clocks, so a single matching origin is
 * credited without consulting either, and an undecidable comparison falls back to the oldest
 * match rather than defaulting to the newest Organization.
 */
function findApprovingInvitationOrigin(request: PlatformAccessRequestAdminRow): AccessRequestInvitationOrigin | null {
	const byInviter = request.invitation_origins.filter((origin) => origin.inviter_user_id === request.reviewed_by);
	if (byInviter.length <= 1) return byInviter[0] ?? null;

	const newestFirst = [...byInviter].sort(
		(a, b) => new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime()
	);
	const reviewedAt = request.reviewed_at ? new Date(request.reviewed_at).getTime() : Number.NaN;
	const beforeReview = newestFirst.filter((origin) => new Date(origin.invited_at).getTime() <= reviewedAt);

	return beforeReview[0] ?? newestFirst[newestFirst.length - 1];
}

/**
 * An invite-origin request is auto-approved when the reviewer on record is the inviter itself
 * (ADR 0012). A platform admin who approved such a request by hand stays the reviewer, so the
 * comparison — not the mere presence of an invitation origin — is what separates the two.
 */
function resolveAutoApproval(request: PlatformAccessRequestAdminRow): {
	auto_approved: boolean;
	auto_approval_detail: string | null;
} {
	if (request.status !== 'approved' || !request.reviewed_by) {
		return { auto_approved: false, auto_approval_detail: null };
	}

	const approvingOrigin = findApprovingInvitationOrigin(request);
	if (!approvingOrigin) return { auto_approved: false, auto_approval_detail: null };

	return {
		auto_approved: true,
		auto_approval_detail: `Auto-approved via invite from ${approvingOrigin.organization_name}. Invited by ${approvingOrigin.inviter_label}; no platform admin reviewed this request.`
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
		...resolveAutoApproval(request),
		...resolveSetupState(request, now)
	};
}

function mapSetupLinkFailureToStatus(reason: AccountSetupLinkNotCreatedReason): PlatformAccessRequestAdminSendResult {
	switch (reason) {
		case 'access-request-missing':
			return { status: 'not_found' };
		case 'access-request-not-approved':
			return { status: 'not_approved' };
		case 'access-request-completed':
			return { status: 'setup_completed' };
		case 'concurrent-create':
			return { status: 'concurrent_create' };
	}
}

function mapSetupLinkDeliveryToStatus(
	issued: Extract<AccountSetupLinkIssuanceResult, { status: 'sent' | 'delivery_failed' }>
): PlatformAccessRequestAdminSendResult {
	return issued.status === 'sent'
		? { status: 'sent', setupDeliveryStatus: 'sent' }
		: { status: 'delivery_failed', setupDeliveryStatus: 'failed' };
}

function logProviderFailure(operation: string, error: unknown): void {
	console.error('[platform-access-request-administration]', {
		operation,
		error: redactProviderError(error)
	});
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
				invitationId: invitation.id,
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

async function issueSetupLink(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		origin: AccountSetupLinkIssuanceOrigin;
		accessRequestId: string;
		email: string;
		publicOrigin: string;
		sensitiveAction: Record<string, unknown>;
		rateLimit: Record<string, unknown>;
	}
): Promise<AccountSetupLinkIssuanceResult> {
	const issuance = createAccountSetupLinkIssuance({
		setupLinks: deps.setupLinks,
		setupDelivery: deps.setupDelivery,
		audit: deps.audit
	});

	return issuance.issue({
		accessRequestId: input.accessRequestId,
		email: input.email,
		publicOrigin: input.publicOrigin,
		origin: input.origin,
		context: {
			sensitiveAction: input.sensitiveAction,
			rateLimit: input.rateLimit
		}
	});
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

				const issued = await issueSetupLink(deps, {
					origin: 'platform_approval',
					accessRequestId: input.accessRequestId,
					email: accessRequest.email,
					publicOrigin: input.publicOrigin,
					sensitiveAction: authorization.sensitiveAction,
					rateLimit: rateLimit.rateLimit
				});

				// The request is already marked approved, so anything short of a live link is a
				// failed approval — except a sibling writer having just minted one.
				if (issued.status === 'not_created') {
					return issued.reason === 'concurrent-create' ? { status: 'concurrent_create' } : { status: 'failed' };
				}

				return mapSetupLinkDeliveryToStatus(issued);
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

				const issued = await issueSetupLink(deps, {
					origin: 'platform_resend',
					accessRequestId: input.accessRequestId,
					email: accessRequest.email,
					publicOrigin: input.publicOrigin,
					sensitiveAction: authorization.sensitiveAction,
					rateLimit: rateLimit.rateLimit
				});

				// A resend reports why no link was created; the request state is unchanged.
				if (issued.status === 'not_created') return mapSetupLinkFailureToStatus(issued.reason);

				return mapSetupLinkDeliveryToStatus(issued);
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
