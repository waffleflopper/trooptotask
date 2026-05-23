import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAccessRequestHeardAboutLabel } from '$lib/accessRequests';
import { loadWithAdminContext, adminAction, type AdminContext } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createAccountSetupLinkService,
	createSupabaseAccountSetupLinkStore,
	sendAccountSetupLinkEmail,
	type AccountSetupLinkFailureReason,
	type AccountSetupLinkRevocationReason,
	type CreateAccountSetupLinkResult
} from '$lib/server/accountSetupLinks';
import {
	createSupabaseAuthEmailOutboxStore,
	sendAccountSetupOutboxDelivery,
	type AuthEmailOutboxStatus
} from '$lib/server/authEmailOutbox';
import {
	ACCESS_REQUEST_INVITATION_ORIGIN_SELECT,
	listSupabaseInviterProfiles,
	resolveAccessRequestInvitationOrigins,
	type AccessRequestInvitationOrigin,
	type AccessRequestInvitationOriginRow
} from '$lib/server/accessRequestInvitationOrigin';
import { rejectAccessRequestAndBlockLinkedInvitations } from '$lib/server/accessRequestInvitationBlocking';
import { makePublicAppUrl } from '$lib/server/publicAppOrigin';
import { notifyAdmins } from '$lib/server/notifications';
import {
	checkPlatformAccessRequestSetupRateLimit,
	platformAccessRequestRateLimitAuditDetails,
	platformAccessRequestRateLimitMessage,
	type PlatformAccessRequestSetupAction
} from '$lib/server/platformAccessRequestRateLimit';
import {
	createSupabaseSensitiveActionAuthorizer,
	PLATFORM_ACCESS_REQUEST_APPROVE_ACTION,
	PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION,
	sensitiveActionDecisionAuditDetails,
	sensitiveActionDenialMessage,
	sensitiveActionStepUpPath
} from '$lib/server/sensitiveActionAuthorizer';

interface AccessRequestSetupLink {
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

interface AccessRequestAuthEmailOutbox {
	id: string;
	setup_link_id: string;
	status: AuthEmailOutboxStatus;
	attempt_count: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	sent_at: string | null;
}

interface AccessRequestRow {
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
	access_request_organization_invitation_links:
		| AccessRequestInvitationOriginRow
		| AccessRequestInvitationOriginRow[]
		| null;
}

interface AccessRequestItem {
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

type AccessRequestSetupState =
	| 'not_sent'
	| 'delivery_failed'
	| 'delivery_pending'
	| 'claimed'
	| 'pending'
	| 'expired'
	| 'replaced'
	| 'failed'
	| 'completed';

function normalizeSetupLinks(links: AccessRequestRow['account_setup_links']): AccessRequestSetupLink[] {
	if (!links) return [];
	const normalized = Array.isArray(links) ? links : [links];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function normalizeOutboxRows(rows: AccessRequestRow['auth_email_outbox']): AccessRequestAuthEmailOutbox[] {
	if (!rows) return [];
	const normalized = Array.isArray(rows) ? rows : [rows];
	return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getRevokedSetupState(link: AccessRequestSetupLink): {
	label: string;
	detail: string;
} {
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
	request: AccessRequestRow,
	now: Date
): Omit<
	AccessRequestItem,
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

function makeSetupUrl(origin: string, setupPath: string): string {
	return makePublicAppUrl(setupPath, { inboundOrigin: origin });
}

async function notifyGovernorsOfBlockedInvitations(input: {
	adminUserId: string;
	blockedInvitations: Array<{ organizationId: string; email: string }>;
}): Promise<void> {
	for (const invitation of input.blockedInvitations) {
		try {
			await notifyAdmins(invitation.organizationId, input.adminUserId, {
				type: 'member_invite_blocked',
				title: 'Invitation Blocked',
				message: `"${invitation.email}" can no longer use the organization invitation because platform access was rejected.`,
				link: `/org/${invitation.organizationId}/settings`
			});
		} catch (error) {
			console.error('[admin-access-requests]', {
				status: 'blocked-invitation-notification-failed',
				organizationId: invitation.organizationId,
				email: invitation.email,
				error
			});
		}
	}
}

function mapSetupLinkResultToFailure(result: CreateAccountSetupLinkResult) {
	switch (result.status) {
		case 'access-request-missing':
			return fail(404, { error: 'Access request not found' });
		case 'access-request-not-approved':
			return fail(400, { error: 'Access request must be approved before setup can be sent.' });
		case 'access-request-completed':
			return fail(400, {
				error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
			});
		case 'concurrent-create':
			return fail(409, {
				error:
					'Another setup link is being created for this request. Refresh and try again if a fresh link does not appear.'
			});
		case 'created':
			return null;
	}
}

async function checkSetupSendRateLimit(input: {
	ctx: AdminContext;
	action: PlatformAccessRequestSetupAction;
	requestId: string;
	email: string;
}) {
	const decision = await checkPlatformAccessRequestSetupRateLimit({
		action: input.action,
		adminUserId: input.ctx.adminUser.id,
		accessRequestId: input.requestId
	});
	const details = platformAccessRequestRateLimitAuditDetails(decision);
	if (decision.limited) {
		input.ctx.audit({
			action:
				input.action === 'approval'
					? 'access_request.account_setup_approval_rate_limited'
					: 'access_request.account_setup_resend_rate_limited',
			resourceType: 'access_request',
			resourceId: input.requestId,
			details: {
				email: input.email,
				rateLimit: details
			},
			severity: 'warning'
		});
		return {
			ok: false as const,
			failure: fail(429, {
				error: platformAccessRequestRateLimitMessage(input.action),
				retryAfterSeconds: Math.max(1, Math.ceil((decision.retryAfterMs ?? 0) / 1000))
			})
		};
	}

	return { ok: true as const, decision, details };
}

async function authorizeSetupSend(input: {
	ctx: AdminContext;
	action: PlatformAccessRequestSetupAction;
	requestId: string;
	email: string;
}) {
	const sensitiveAction =
		input.action === 'approval' ? PLATFORM_ACCESS_REQUEST_APPROVE_ACTION : PLATFORM_ACCESS_REQUEST_RESEND_SETUP_ACTION;
	const authorizer = createSupabaseSensitiveActionAuthorizer({
		supabase: input.ctx.sessionClient,
		session: input.ctx.session
	});
	const decision = await authorizer.authorize({
		action: sensitiveAction,
		actorUserId: input.ctx.adminUser.id,
		target: { type: 'access_request', id: input.requestId }
	});

	if (decision.allowed) {
		return { ok: true as const, decision };
	}

	const details = sensitiveActionDecisionAuditDetails(decision);
	input.ctx.audit({
		action:
			input.action === 'approval'
				? 'access_request.account_setup_approval_authorization_denied'
				: 'access_request.account_setup_resend_authorization_denied',
		resourceType: 'access_request',
		resourceId: input.requestId,
		details: {
			email: input.email,
			sensitiveAction: details
		},
		severity: 'warning'
	});

	return {
		ok: false as const,
		failure: fail(403, {
			error: sensitiveActionDenialMessage(decision),
			reason: decision.reason,
			requiresStepUp: decision.requiresStepUp,
			stepUpPath: sensitiveActionStepUpPath(decision)
		})
	};
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'access-requests',
	fn: async (ctx) => {
		const supabase = ctx.adminClient;

		const { data: requests, error: fetchError } = await selectAllSupabaseRows<AccessRequestRow>(
			(from, to) =>
				supabase
					.from('access_requests')
					.select(
						`id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at, setup_completed_at, account_setup_links(id, created_at, expires_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason), auth_email_outbox(id, setup_link_id, status, attempt_count, last_error, created_at, updated_at, sent_at), ${ACCESS_REQUEST_INVITATION_ORIGIN_SELECT}`
					)
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data: AccessRequestRow[] | null;
					error: unknown;
				}>
		);

		if (fetchError) {
			console.error('Failed to fetch access requests:', fetchError);
		}

		const now = new Date();
		const invitationOriginsByRequestId = await resolveAccessRequestInvitationOrigins(
			requests ?? [],
			supabase.auth.admin,
			{
				listUserProfilesByIds: (userIds) => listSupabaseInviterProfiles(supabase, userIds)
			}
		);
		const allRequests: AccessRequestItem[] = (requests ?? []).map((request) => ({
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
			invitation_origins: invitationOriginsByRequestId[request.id] ?? [],
			...resolveSetupState(request, now)
		}));

		return {
			pending: allRequests.filter((r) => r.status === 'pending'),
			reviewed: allRequests.filter((r) => r.status !== 'pending')
		};
	}
});

export const actions: Actions = {
	approve: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await adminClient
				.from('access_requests')
				.select('*')
				.eq('id', requestId)
				.eq('status', 'pending')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Request not found or already reviewed' });
			}

			const authorization = await authorizeSetupSend({
				ctx,
				action: 'approval',
				requestId,
				email: accessRequest.email
			});
			if (!authorization.ok) {
				return authorization.failure;
			}
			const sensitiveAction = sensitiveActionDecisionAuditDetails(authorization.decision);

			const rateLimit = await checkSetupSendRateLimit({
				ctx,
				action: 'approval',
				requestId,
				email: accessRequest.email
			});
			if (!rateLimit.ok) {
				return rateLimit.failure;
			}

			const { error: updateErr } = await adminClient
				.from('access_requests')
				.update({
					status: 'approved',
					reviewed_by: ctx.adminUser.id,
					reviewed_at: new Date().toISOString()
				})
				.eq('id', requestId);

			if (updateErr) {
				console.error('Failed to update access request:', updateErr);
				return fail(500, { error: 'Failed to approve request' });
			}

			const setupLinks = createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(adminClient));
			const setupResult = await setupLinks.createForAccessRequest(requestId);
			if (setupResult.status !== 'created') {
				return mapSetupLinkResultToFailure(setupResult);
			}

			const delivery = await sendAccountSetupOutboxDelivery(
				createSupabaseAuthEmailOutboxStore(adminClient),
				sendAccountSetupLinkEmail,
				{
					accessRequestId: requestId,
					setupLinkId: setupResult.link.id,
					email: accessRequest.email,
					setupUrl: makeSetupUrl(event.url.origin, setupResult.setupPath),
					expiresAt: setupResult.expiresAt
				}
			);

			ctx.audit({
				action: 'access_request.approved',
				resourceType: 'access_request',
				resourceId: requestId,
				details: { email: accessRequest.email }
			});
			if (delivery.status === 'sent') {
				ctx.audit({
					action: 'access_request.account_setup_link_sent',
					resourceType: 'access_request',
					resourceId: requestId,
					details: {
						email: accessRequest.email,
						setupLinkId: setupResult.link.id,
						outboxId: delivery.outbox.id,
						expiresAt: setupResult.expiresAt.toISOString(),
						sensitiveAction,
						rateLimit: rateLimit.details
					},
					severity: 'info'
				});
			} else {
				ctx.audit({
					action: 'access_request.account_setup_link_delivery_failed',
					resourceType: 'access_request',
					resourceId: requestId,
					details: {
						email: accessRequest.email,
						setupLinkId: setupResult.link.id,
						outboxId: delivery.outbox.id,
						sensitiveAction,
						rateLimit: rateLimit.details
					},
					severity: 'warning'
				});
			}

			return { success: true, action: 'approve', setupDeliveryStatus: delivery.status };
		}
	}),

	reject: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const supabase = ctx.adminClient;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const rejectResult = await rejectAccessRequestAndBlockLinkedInvitations(supabase, {
				accessRequestId: requestId,
				reviewerId: ctx.adminUser.id
			});

			if (rejectResult.status === 'not_found') {
				return fail(404, { error: 'Request not found or already reviewed' });
			}

			if (rejectResult.status === 'failed') {
				console.error('Failed to reject access request:', rejectResult.message);
				return fail(500, { error: 'Failed to reject request' });
			}

			ctx.audit({
				action: 'access_request.rejected',
				resourceType: 'access_request',
				resourceId: requestId,
				details: {
					blockedInvitationCount: rejectResult.blockedInvitations.length
				}
			});

			await notifyGovernorsOfBlockedInvitations({
				adminUserId: ctx.adminUser.id,
				blockedInvitations: rejectResult.blockedInvitations
			});

			return { success: true, action: 'reject' };
		}
	}),

	resend: adminAction({
		page: 'access-requests',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;

			const formData = await event.request.formData();
			const requestId = formData.get('requestId') as string;

			if (!requestId) return fail(400, { error: 'Missing request ID' });

			const { data: accessRequest, error: fetchErr } = await adminClient
				.from('access_requests')
				.select('id, email, status, setup_completed_at')
				.eq('id', requestId)
				.eq('status', 'approved')
				.single();

			if (fetchErr || !accessRequest) {
				return fail(404, { error: 'Approved request not found' });
			}

			if (accessRequest.setup_completed_at) {
				return fail(400, {
					error: 'This user has already completed account setup. They can sign in or use reset password if needed.'
				});
			}

			const authorization = await authorizeSetupSend({
				ctx,
				action: 'resend',
				requestId,
				email: accessRequest.email
			});
			if (!authorization.ok) {
				return authorization.failure;
			}
			const sensitiveAction = sensitiveActionDecisionAuditDetails(authorization.decision);

			const rateLimit = await checkSetupSendRateLimit({
				ctx,
				action: 'resend',
				requestId,
				email: accessRequest.email
			});
			if (!rateLimit.ok) {
				return rateLimit.failure;
			}

			const setupLinks = createAccountSetupLinkService(createSupabaseAccountSetupLinkStore(adminClient));
			const setupResult = await setupLinks.createForAccessRequest(requestId);
			if (setupResult.status !== 'created') {
				return mapSetupLinkResultToFailure(setupResult);
			}

			const delivery = await sendAccountSetupOutboxDelivery(
				createSupabaseAuthEmailOutboxStore(adminClient),
				sendAccountSetupLinkEmail,
				{
					accessRequestId: requestId,
					setupLinkId: setupResult.link.id,
					email: accessRequest.email,
					setupUrl: makeSetupUrl(event.url.origin, setupResult.setupPath),
					expiresAt: setupResult.expiresAt
				}
			);

			ctx.audit({
				action:
					delivery.status === 'sent'
						? 'access_request.account_setup_link_resent'
						: 'access_request.account_setup_link_delivery_failed',
				resourceType: 'access_request',
				resourceId: requestId,
				details: {
					email: accessRequest.email,
					setupLinkId: setupResult.link.id,
					outboxId: delivery.outbox.id,
					expiresAt: setupResult.expiresAt.toISOString(),
					sensitiveAction,
					rateLimit: rateLimit.details
				},
				severity: delivery.status === 'sent' ? 'info' : 'warning'
			});

			return { success: true, action: 'resend', setupDeliveryStatus: delivery.status };
		}
	})
};
