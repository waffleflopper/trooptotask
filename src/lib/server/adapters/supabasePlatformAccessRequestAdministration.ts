import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { createSupabaseAccountSetupLinkIssuancePorts } from './supabaseAccountSetupLinkIssuance';
import {
	ACCESS_REQUEST_INVITATION_ORIGIN_SELECT,
	listSupabaseInviterProfiles,
	resolveAccessRequestInvitationOrigins,
	type AccessRequestInvitationOriginRow
} from '$lib/server/accessRequestInvitationOrigin';
import { rejectAccessRequestAndBlockLinkedInvitations } from '$lib/server/accessRequestInvitationBlocking';
import { notifyAdmins } from '$lib/server/notifications';
import { checkPlatformAccessRequestSetupRateLimit } from '$lib/server/platformAccessRequestRateLimit';
import { createSupabaseSensitiveActionAuthorizer } from '$lib/server/sensitiveActionAuthorizer';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createPlatformAccessRequestAdministration,
	type AccessRequestAuthEmailOutbox,
	type AccessRequestSetupLink,
	type PlatformAccessRequestAdministration,
	type PlatformAccessRequestAdministrationStore,
	type PlatformAccessRequestAdminCommandRow,
	type PlatformAccessRequestAdminRow
} from '$lib/server/core/useCases/platformAccessRequestAdministration';

interface SupabaseAccessRequestAdminRow {
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
	access_request_organization_invitation_links:
		| AccessRequestInvitationOriginRow
		| AccessRequestInvitationOriginRow[]
		| null;
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { code?: unknown; details?: unknown; message?: unknown };
	return (
		candidate.code === 'PGRST116' ||
		(typeof candidate.message === 'string' && candidate.message.toLowerCase().includes('no rows'))
	);
}

function mapCommandRow(row: unknown): PlatformAccessRequestAdminCommandRow {
	const request = row as {
		id: string;
		email: string;
		status: 'pending' | 'approved' | 'rejected';
		setup_completed_at?: string | null;
	};

	return {
		id: request.id,
		email: request.email,
		status: request.status,
		setup_completed_at: request.setup_completed_at ?? null
	};
}

export function createSupabasePlatformAccessRequestAdministrationStore(
	supabase: SupabaseClient
): PlatformAccessRequestAdministrationStore {
	return {
		async listAccessRequests(): Promise<PlatformAccessRequestAdminRow[]> {
			const { data: requests, error } = await selectAllSupabaseRows<SupabaseAccessRequestAdminRow>(
				(from, to) =>
					supabase
						.from('access_requests')
						.select(
							`id, name, email, reason, heard_about, heard_about_details, status, created_at, reviewed_at, reviewed_by, setup_completed_at, account_setup_links(id, created_at, expires_at, claimed_at, failed_at, failure_reason, used_at, revoked_at, revocation_reason), auth_email_outbox(id, setup_link_id, status, attempt_count, last_error, created_at, updated_at, sent_at), ${ACCESS_REQUEST_INVITATION_ORIGIN_SELECT}`
						)
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as Promise<{
						data: SupabaseAccessRequestAdminRow[] | null;
						error: unknown;
					}>
			);

			if (error) throw new Error('Failed to fetch access requests');

			const rows = requests ?? [];
			const invitationOriginsByRequestId = await resolveAccessRequestInvitationOrigins(rows, supabase.auth.admin, {
				listUserProfilesByIds: (userIds) => listSupabaseInviterProfiles(supabase, userIds)
			});

			return rows.map((request) => ({
				id: request.id,
				name: request.name,
				email: request.email,
				reason: request.reason,
				heard_about: request.heard_about,
				heard_about_details: request.heard_about_details,
				status: request.status,
				created_at: request.created_at,
				reviewed_at: request.reviewed_at,
				reviewed_by: request.reviewed_by,
				setup_completed_at: request.setup_completed_at,
				account_setup_links: request.account_setup_links,
				auth_email_outbox: request.auth_email_outbox,
				invitation_origins: invitationOriginsByRequestId[request.id] ?? []
			}));
		},

		async getPendingAccessRequestForApproval(accessRequestId) {
			const { data, error } = await supabase
				.from('access_requests')
				.select('id, email, status, setup_completed_at')
				.eq('id', accessRequestId)
				.eq('status', 'pending')
				.maybeSingle();

			if (error && !isNotFoundError(error)) throw error;
			return data ? mapCommandRow(data) : null;
		},

		async markPendingRequestApproved(input) {
			const { data, error } = await supabase
				.from('access_requests')
				.update({
					status: 'approved',
					reviewed_by: input.reviewerId,
					reviewed_at: input.reviewedAt.toISOString()
				})
				.eq('id', input.accessRequestId)
				.eq('status', 'pending')
				.select('id')
				.maybeSingle();

			if (error && !isNotFoundError(error)) throw error;
			return data ? 'approved' : 'not_found';
		},

		async getApprovedAccessRequestForResend(accessRequestId) {
			const { data, error } = await supabase
				.from('access_requests')
				.select('id, email, status, setup_completed_at')
				.eq('id', accessRequestId)
				.eq('status', 'approved')
				.maybeSingle();

			if (error && !isNotFoundError(error)) throw error;
			return data ? mapCommandRow(data) : null;
		},

		async rejectPendingAccessRequestAndBlockLinkedInvitations(input) {
			return rejectAccessRequestAndBlockLinkedInvitations(supabase, {
				accessRequestId: input.accessRequestId,
				reviewerId: input.actorUserId
			});
		}
	};
}

export function createSupabasePlatformAccessRequestAdministration(
	ctx: AdminContext
): PlatformAccessRequestAdministration {
	return createPlatformAccessRequestAdministration({
		store: createSupabasePlatformAccessRequestAdministrationStore(ctx.adminClient),
		...createSupabaseAccountSetupLinkIssuancePorts(ctx.adminClient),
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			supabase: ctx.sessionClient,
			authenticatedUserId: ctx.adminUser.id,
			session: ctx.session
		}),
		checkSetupRateLimit: checkPlatformAccessRequestSetupRateLimit,
		audit: (event) => ctx.audit(event),
		notifyGovernors: {
			notifyInvitationBlocked: (input) =>
				notifyAdmins(input.organizationId, input.adminUserId, {
					type: 'member_invite_blocked',
					title: 'Invitation Blocked',
					message: `"${input.email}" can no longer use the organization invitation because platform access was rejected.`,
					link: `/org/${input.organizationId}/settings`
				})
		}
	});
}
