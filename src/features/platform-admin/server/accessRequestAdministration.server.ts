import { getAccessRequestHeardAboutLabel } from '$features/identity/contracts';
import {
	classifyAccessRequestSetupState,
	findLatestAccessRequestSetupDelivery,
	isSetupGrantWithdrawn,
	normalizeAccessRequestSetupDeliveries,
	normalizeAccessRequestSetupLinks,
	type AccessRequestSetupLink,
	type AccessRequestSetupState
} from '$features/identity/index.server';
import type { BlockedOrganizationInvitation } from '$features/identity/contracts';
import {
	createAccountSetupLinkIssuance,
	redactProviderError,
	type AccountSetupLinkIssuanceCreator,
	type AccountSetupLinkIssuanceDelivery,
	type AccountSetupLinkIssuanceOrigin,
	type AccountSetupLinkIssuanceResult,
	type AccountSetupLinkNotCreatedReason
} from '$features/identity/index.server';
import {
	PLATFORM_ACCESS_REQUEST_APPROVE_ACTION,
	PLATFORM_ACCESS_REQUEST_REJECT_ACTION,
	PLATFORM_ACCESS_REQUEST_RESCIND_ACTION,
	PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION,
	type SensitiveActionAuthorizer
} from '$features/identity/contracts';
import {
	sensitiveActionDecisionAuditDetails,
	sensitiveActionDenialMessage,
	sensitiveActionFailureFields
} from '$features/identity/index.server';
import {
	platformAccessRequestRateLimitAuditDetails,
	platformAccessRequestRateLimitMessage,
	type PlatformAccessRequestRateLimitDecision,
	type PlatformAccessRequestSetupAction
} from './accessRequestRateLimit.server';

import type {
	AccessRequestInvitationOrigin,
	PlatformAccessRequestAdminRow,
	PlatformAccessRequestAdminItem,
	PlatformAccessRequestAdminSendResult,
	PlatformAccessRequestAdminRejectResult,
	PlatformAccessRequestAdminRescindResult,
	PlatformAccessRequestAdministration,
	PlatformAccessRequestAdministrationStore,
	PlatformAccessRequestAdministrationAuditEvent
} from '../accessRequestTypes';
export type * from '../accessRequestTypes';

interface PlatformAccessRequestGovernorNotifier {
	notifyInvitationBlocked(input: {
		organizationId: string;
		adminUserId: string;
		email: string;
		reason: 'rejected' | 'rescinded';
	}): Promise<void>;
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
	audit: (event: PlatformAccessRequestAdministrationAuditEvent) => Promise<void>;
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
	now: Date,
	heldClaim: PlatformAccessRequestAdminItem['held_setup_claim']
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
	| 'approval_basis'
	| 'setup_grant_withdrawn'
> {
	const links = normalizeAccessRequestSetupLinks(request.account_setup_links);
	const deliveries = normalizeAccessRequestSetupDeliveries(request.auth_email_outbox);
	const latestLink = links[0] ?? null;
	const latestDelivery = findLatestAccessRequestSetupDelivery(links, deliveries);
	const setupState = classifyAccessRequestSetupState({
		status: request.status,
		setupCompletedAt: request.setup_completed_at,
		latestLink,
		latestDelivery,
		now
	});
	const copy = heldClaim
		? setupState === 'completed'
			? {
					label: 'Completed, claim held',
					detail:
						'Account setup completed, but a claim record still blocks other setup links for this email. Staff must confirm the Auth operation has ended before releasing the claim.'
				}
			: {
					label: 'Claim held',
					detail:
						'A setup attempt may still be running. If it stalls, staff must confirm its Auth operation has ended before releasing the claim. Sending another setup link will not unlock it.'
				}
		: isRowSetupGrantWithdrawn(request)
			? {
					label: 'Invitation withdrawn',
					detail:
						'Every Organization Invitation behind this approval was revoked or blocked, so no setup link can be sent or used. A new invitation from an Organization restores it.'
				}
			: getSetupStateCopy(setupState, latestLink);

	return {
		setup_state: setupState,
		setup_state_label: copy.label,
		setup_state_detail: copy.detail,
		held_setup_claim: heldClaim,
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
		case 'rescinded':
			return {
				label: 'Rescinded',
				detail:
					'Platform access was rescinded before account setup finished. Unused setup links were revoked and linked pending invitations were blocked.'
			};
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
				detail: 'The setup link has been claimed and cannot be used again.'
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

function resolveAutoApproval(request: PlatformAccessRequestAdminRow): {
	auto_approved: boolean;
	auto_approval_detail: string | null;
} {
	if (request.approval_basis !== 'organization_invitation') {
		return { auto_approved: false, auto_approval_detail: null };
	}

	const approvingOrigin = findApprovingInvitationOrigin(request);
	return {
		auto_approved: true,
		auto_approval_detail: approvingOrigin
			? `Auto-approved via invite from ${approvingOrigin.organization_name}. Invited by ${approvingOrigin.inviter_label}; no platform admin reviewed this request.`
			: 'Auto-approved via an Organization Invitation that is no longer on record; no platform admin reviewed this request.'
	};
}

function isRowSetupGrantWithdrawn(request: PlatformAccessRequestAdminRow): boolean {
	return isSetupGrantWithdrawn({
		status: request.status,
		setupCompletedAt: request.setup_completed_at,
		setupGrantLive: request.setup_grant_live
	});
}

function heldClaimsByEmail(
	requests: PlatformAccessRequestAdminRow[]
): Map<string, PlatformAccessRequestAdminItem['held_setup_claim']> {
	const claims = new Map<string, NonNullable<PlatformAccessRequestAdminItem['held_setup_claim']>>();
	for (const request of requests) {
		const email = request.email.trim().toLowerCase();
		const links = request.account_setup_links;
		for (const link of links ? (Array.isArray(links) ? links : [links]) : []) {
			if (!link.claimed_at || link.failed_at || link.used_at) continue;
			const existing = claims.get(email);
			if (!existing || link.claimed_at < existing.claimedAt) {
				claims.set(email, { accessRequestId: request.id, linkId: link.id, claimedAt: link.claimed_at });
			}
		}
	}
	return claims;
}

function shapeListItem(
	request: PlatformAccessRequestAdminRow,
	now: Date,
	heldClaim: PlatformAccessRequestAdminItem['held_setup_claim']
): PlatformAccessRequestAdminItem {
	return {
		id: request.id,
		name: request.name,
		email: request.email,
		reason: request.reason,
		heard_about: request.heard_about,
		heard_about_label: getAccessRequestHeardAboutLabel(request.heard_about),
		heard_about_details: request.heard_about_details,
		status: request.status,
		approval_basis: request.approval_basis,
		created_at: request.created_at,
		reviewed_at: request.reviewed_at,
		setup_completed_at: request.setup_completed_at,
		invitation_origins: request.invitation_origins,
		...resolveAutoApproval(request),
		setup_grant_withdrawn: isRowSetupGrantWithdrawn(request),
		...resolveSetupState(request, now, heldClaim)
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
	reason: 'rejected' | 'rescinded';
}): Promise<void> {
	for (const invitation of input.blockedInvitations) {
		try {
			await input.notifyGovernors.notifyInvitationBlocked({
				organizationId: invitation.organizationId,
				adminUserId: input.adminUserId,
				email: invitation.email,
				reason: input.reason
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

	await deps.audit({
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
		await deps.audit({
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

async function authorizeWithdrawal(
	deps: PlatformAccessRequestAdministrationDependencies,
	input: {
		action: 'reject' | 'rescind';
		accessRequestId: string;
		actorUserId: string;
	}
): Promise<
	| { ok: true }
	| {
			ok: false;
			result: Extract<PlatformAccessRequestAdminRejectResult, { status: 'authorization_denied' }>;
	  }
> {
	const decision = await deps.sensitiveActionAuthorizer.authorize({
		action: input.action === 'reject' ? PLATFORM_ACCESS_REQUEST_REJECT_ACTION : PLATFORM_ACCESS_REQUEST_RESCIND_ACTION,
		actorUserId: input.actorUserId,
		target: { type: 'access_request', id: input.accessRequestId }
	});

	const details = sensitiveActionDecisionAuditDetails(decision);
	if (decision.allowed) {
		return { ok: true };
	}

	await deps.audit({
		action:
			input.action === 'reject'
				? 'access_request.rejection_authorization_denied'
				: 'access_request.rescission_authorization_denied',
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
			const heldClaims = heldClaimsByEmail(requests);
			const allRequests = requests.map((request) =>
				shapeListItem(request, referenceTime, heldClaims.get(request.email.trim().toLowerCase()) ?? null)
			);

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

				await deps.audit({
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
				const authorization = await authorizeWithdrawal(deps, { ...input, action: 'reject' });
				if (!authorization.ok) return authorization.result;

				const rejectResult = await deps.store.rejectPendingAccessRequestAndBlockLinkedInvitations(input);

				if (rejectResult.status === 'not_found') return { status: 'already_reviewed' };
				if (rejectResult.status === 'failed') return { status: 'failed' };

				await deps.audit({
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
					blockedInvitations: rejectResult.blockedInvitations,
					reason: 'rejected'
				});

				return { status: 'rejected' };
			} catch (error) {
				logProviderFailure('reject', error);
				return { status: 'failed' };
			}
		},

		async rescind(input): Promise<PlatformAccessRequestAdminRescindResult> {
			try {
				const authorization = await authorizeWithdrawal(deps, { ...input, action: 'rescind' });
				if (!authorization.ok) return authorization.result;

				const rescindResult = await deps.store.rescindApprovedAccessRequestAndBlockLinkedInvitations(input);

				if (rescindResult.status === 'not_found') return { status: 'not_approved' };
				if (rescindResult.status === 'completed') return { status: 'setup_completed' };
				if (rescindResult.status === 'claim-held') return { status: 'claim_held' };
				if (rescindResult.status === 'failed') return { status: 'failed' };

				await deps.audit({
					action: 'access_request.rescinded',
					resourceType: 'access_request',
					resourceId: input.accessRequestId,
					details: {
						blockedInvitationCount: rescindResult.blockedInvitations.length
					},
					severity: 'warning'
				});

				await notifyGovernorsOfBlockedInvitations({
					notifyGovernors: deps.notifyGovernors,
					adminUserId: input.actorUserId,
					blockedInvitations: rescindResult.blockedInvitations,
					reason: 'rescinded'
				});

				return { status: 'rescinded' };
			} catch (error) {
				logProviderFailure('rescind', error);
				return { status: 'failed' };
			}
		}
	};
}
