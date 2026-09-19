import type {
	OrganizationInvitationRevokeResult,
	OrganizationMembershipUpdateInput,
	OrganizationSettingsMemberManagementPort
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { ACCESS_REQUEST_SETUP_RENEWAL_DAYS } from '$lib/server/accessRequestSetupDelivery';
import { addUtcDays } from '$lib/server/accountSetupDates';
import { getAdminClient } from '$lib/server/supabase';
import { findUserEmailIdentityByEmail, normalizeUserEmailIdentity } from '$lib/server/userEmailIdentities';
import type { SupabaseClient } from '@supabase/supabase-js';

interface OrganizationInvitationLookupRow {
	id: string;
	email?: string;
	created_at?: string;
	expires_at?: string;
}

interface AccessRequestInvitationLinkRow {
	id: string;
	access_requests?: AccessRequestInvitationLinkAccessRequestRow[] | AccessRequestInvitationLinkAccessRequestRow | null;
}

interface AccessRequestInvitationLinkAccessRequestRow {
	email?: string | null;
	setup_completed_at?: string | null;
	setup_user_id?: string | null;
}

interface AccessRequestLookupRow {
	id: string;
}

interface OrganizationMembershipLookupRow {
	user_id: string | null;
	role: string | null;
	email: string | null;
}

interface OrganizationRow {
	name: string | null;
}

interface RevokeOrganizationInvitationRpcRow {
	revoke_status: OrganizationInvitationRevokeResult['status'] | null;
	revoked_email: string | null;
}

interface AuthUserConfirmationRow {
	confirmed_at?: string | null;
	email_confirmed_at?: string | null;
}

function isUniqueConstraintError(error: unknown, constraintName: string): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
	const message = [
		typeof candidate.message === 'string' ? candidate.message : '',
		typeof candidate.details === 'string' ? candidate.details : ''
	].join(' ');

	return candidate.code === '23505' && message.includes(constraintName);
}

async function findUserAccountByEmail(
	adminClient: SupabaseClient,
	email: string
): Promise<{ id: string; email: string; emailConfirmed?: boolean } | null> {
	const identity = await findUserEmailIdentityByEmail(adminClient, email);
	if (!identity) return null;

	const { data, error } = await adminClient.auth.admin.getUserById(identity.userId);
	if (error) {
		throw error;
	}

	const user = data?.user as AuthUserConfirmationRow | null;
	return {
		id: identity.userId,
		email: identity.normalizedEmail,
		emailConfirmed: hasTimestamp(user?.email_confirmed_at) || hasTimestamp(user?.confirmed_at)
	};
}

export function createSupabaseOrgSettingsMemberManagementPort(
	locals: Pick<App.Locals, 'supabase'>,
	deps: { getAdminClient?: () => SupabaseClient } = {}
): OrganizationSettingsMemberManagementPort {
	const supabase = locals.supabase;
	const getAdminClientFn = deps.getAdminClient ?? getAdminClient;

	return {
		async findPendingInvitation(orgId, email) {
			const { data, error } = await supabase
				.from('organization_invitations')
				.select('id')
				.eq('organization_id', orgId)
				.eq('normalized_email', email)
				.eq('status', 'pending')
				.gt('expires_at', new Date().toISOString())
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return null;
			}

			return { id: data.id };
		},

		async findPendingInvitationById(orgId, inviteId) {
			const { data, error } = await supabase
				.from('organization_invitations')
				.select('id, email, expires_at')
				.eq('id', inviteId)
				.eq('organization_id', orgId)
				.eq('status', 'pending')
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return null;
			}

			const now = new Date();
			if (data.expires_at && new Date(data.expires_at) <= now) {
				await expirePendingInvitationById(supabase, orgId, inviteId, now);
				return {
					id: data.id,
					email: data.email ?? '',
					status: 'expired',
					requiresAccountSetup: false
				};
			}

			const adminSupabase = getAdminClientFn();
			const invitationEmail = data.email ?? '';
			const accessRequestLinks = await findInvitationAccessRequestLinksForSetup(adminSupabase, orgId, inviteId);
			const emailIdentity =
				accessRequestLinks.length > 0 ? await findUserEmailIdentityByEmail(adminSupabase, invitationEmail) : null;
			const emailIdentityUserId = emailIdentity?.userId ?? null;
			const requiresAccountSetup =
				requiresLinkedAccessRequestSetup(invitationEmail, accessRequestLinks, emailIdentityUserId) &&
				!(await hasCompletedAccessRequestSetupForEmail(adminSupabase, invitationEmail, emailIdentityUserId));
			return {
				id: data.id,
				email: invitationEmail,
				status: 'pending',
				requiresAccountSetup
			};
		},

		async createInvitation(input) {
			await expirePendingInvitationForEmail(supabase, input.organizationId, input.email);

			const { data, error } = await supabase
				.from('organization_invitations')
				.insert({
					organization_id: input.organizationId,
					email: input.email,
					invited_by: input.invitedBy,
					role: input.role,
					member_preset: input.memberPreset,
					capability_overrides: input.capabilityOverrides,
					access_scope_kind: input.accessScopeKind,
					access_scope_group_ids: input.accessScopeGroupIds
				})
				.select('id, created_at')
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return { status: 'failed', message: error?.message ?? 'Invitation could not be created' };
			}

			return { status: 'created', invitationId: data.id, createdAt: data.created_at ?? new Date().toISOString() };
		},

		async findUserAccountByEmail(email) {
			return findUserAccountByEmail(getAdminClientFn(), email);
		},

		async createOrLinkApprovedAccessRequestForInvitation(input) {
			const adminSupabase = getAdminClientFn();
			let accessRequest = await findReusableAccessRequestForInvitation(adminSupabase, input.email);
			let status: 'created' | 'linked' = 'linked';

			if (!accessRequest) {
				// Insert pending, never approved: access_requests_pending_email_idx only covers
				// pending rows, and it is the only serialization point two simultaneous invites have.
				const created = await insertPendingAccessRequest(adminSupabase, input.email);
				if (created.status === 'failed') {
					if (isUniqueConstraintError(created.error, 'access_requests_pending_email_idx')) {
						// Re-read through the reusable lookup, not the pending one: the writer that
						// won the index may already have flipped its row to approved.
						accessRequest = await findReusableAccessRequestForInvitation(adminSupabase, input.email);
					}
					if (!accessRequest) {
						return { status: 'failed', message: created.message };
					}
				} else {
					accessRequest = created.accessRequest;
					status = 'created';
				}
			}

			const link = await insertAccessRequestInvitationLink(adminSupabase, {
				accessRequestId: accessRequest.id,
				...input
			});

			if (link.status === 'failed') {
				return { status: 'failed', message: link.message };
			}

			// The inviting Organization owner or admin is the reviewer: their invitation is the
			// vouching. A row another writer already flipped stays theirs; this is a no-op then.
			const approval = await approveInvitedAccessRequest(adminSupabase, {
				accessRequestId: accessRequest.id,
				reviewerId: input.invitedBy
			});

			if (approval.status === 'failed') {
				return { status: 'failed', message: approval.message };
			}

			if (link.status === 'already-linked') {
				return { status: 'already-linked', accessRequestId: accessRequest.id };
			}

			return { status, accessRequestId: accessRequest.id };
		},

		async blockInvitationAfterAccessRequestBridgeFailure(input) {
			const now = new Date().toISOString();
			const { data, error } = await getAdminClientFn()
				.from('organization_invitations')
				.update({
					status: 'blocked',
					blocked_at: now,
					blocked_by: input.blockedBy
				})
				.eq('id', input.invitationId)
				.eq('organization_id', input.organizationId)
				.eq('status', 'pending')
				.select('id')
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return { status: 'failed', message: error?.message ?? 'Invitation could not be blocked' };
			}

			return { status: 'blocked' };
		},

		async revokeInvitation(orgId, inviteId) {
			const { data, error } = await supabase
				.rpc('revoke_organization_invitation', {
					p_invitation_id: inviteId,
					p_organization_id: orgId
				})
				.single<RevokeOrganizationInvitationRpcRow>();

			if (error || !data) {
				return { status: 'failed', email: null };
			}

			return {
				status: normalizeRevokeStatus(data.revoke_status),
				email: data.revoked_email
			};
		},

		async findMembershipById(orgId, membershipId) {
			const { data, error } = await supabase
				.from('organization_memberships')
				.select('user_id, role, email')
				.eq('id', membershipId)
				.eq('organization_id', orgId)
				.single<OrganizationMembershipLookupRow>();

			if (error || !data) {
				return null;
			}

			return {
				userId: data.user_id,
				role: data.role,
				email: data.email,
				canManageMembers: data.role === 'admin' || data.role === 'owner'
			};
		},

		async removeMembership(orgId, membershipId) {
			const adminSupabase = getAdminClientFn();
			const { data, error } = await adminSupabase
				.from('organization_memberships')
				.delete()
				.eq('id', membershipId)
				.eq('organization_id', orgId)
				.select('id');

			if (error) {
				return error.message;
			}

			return data?.length === 1 ? null : 'Membership could not be removed';
		},

		async updateMembership(input) {
			const { error } = await supabase
				.from('organization_memberships')
				.update(serializeMembershipUpdate(input))
				.eq('id', input.membershipId)
				.eq('organization_id', input.organizationId);

			return error?.message ?? null;
		},

		async getOrganizationName(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('name')
				.eq('id', orgId)
				.single<OrganizationRow>();

			if (error || !data) {
				return null;
			}

			return data.name ?? null;
		}
	};
}

async function expirePendingInvitationForEmail(
	supabase: SupabaseClient,
	organizationId: string,
	email: string
): Promise<void> {
	const now = new Date().toISOString();
	await supabase
		.from('organization_invitations')
		.update({
			status: 'expired',
			expired_at: now
		})
		.eq('organization_id', organizationId)
		.eq('normalized_email', email)
		.eq('status', 'pending')
		.lte('expires_at', now);
}

async function expirePendingInvitationById(
	supabase: SupabaseClient,
	organizationId: string,
	invitationId: string,
	now: Date
): Promise<void> {
	await supabase
		.from('organization_invitations')
		.update({
			status: 'expired',
			expired_at: now.toISOString()
		})
		.eq('id', invitationId)
		.eq('organization_id', organizationId)
		.eq('status', 'pending')
		.lte('expires_at', now.toISOString());
}

function linkAccessRequests(link: AccessRequestInvitationLinkRow): AccessRequestInvitationLinkAccessRequestRow[] {
	const requests = link.access_requests;
	return Array.isArray(requests) ? requests : requests ? [requests] : [];
}

function isCompletedAccessRequestSetupForInvitation(
	email: string,
	userId: string | null,
	request: AccessRequestInvitationLinkAccessRequestRow
): boolean {
	return (
		Boolean(request.setup_completed_at) &&
		normalizeUserEmailIdentity(request.email ?? '') === email &&
		(request.setup_user_id == null || request.setup_user_id === userId)
	);
}

function requiresLinkedAccessRequestSetup(
	email: string,
	links: AccessRequestInvitationLinkRow[],
	userId: string | null
): boolean {
	if (links.length === 0) return false;

	const invitationEmail = normalizeUserEmailIdentity(email);
	return !links.some((link) =>
		linkAccessRequests(link).some((request) =>
			isCompletedAccessRequestSetupForInvitation(invitationEmail, userId, request)
		)
	);
}

function hasTimestamp(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

async function findInvitationAccessRequestLinksForSetup(
	client: SupabaseClient,
	organizationId: string,
	invitationId: string
): Promise<AccessRequestInvitationLinkRow[]> {
	const { data, error } = await client
		.from('access_request_organization_invitation_links')
		.select('id, access_requests(email, setup_completed_at, setup_user_id)')
		.eq('organization_invitation_id', invitationId)
		.eq('organization_id', organizationId)
		.maybeSingle<AccessRequestInvitationLinkRow>();

	if (error) {
		throw error;
	}
	if (!data) {
		return [];
	}

	return [data];
}

async function findPendingAccessRequest(client: SupabaseClient, email: string): Promise<AccessRequestLookupRow | null> {
	const { data, error } = await client
		.from('access_requests')
		.select('id')
		.eq('email', normalizeUserEmailIdentity(email))
		.eq('status', 'pending')
		.maybeSingle<AccessRequestLookupRow>();

	if (error) {
		throw error;
	}

	return data ?? null;
}

async function findApprovedIncompleteAccessRequest(
	client: SupabaseClient,
	email: string
): Promise<AccessRequestLookupRow | null> {
	const renewalCutoff = addUtcDays(new Date(), -ACCESS_REQUEST_SETUP_RENEWAL_DAYS).toISOString();
	const quotedRenewalCutoff = `"${renewalCutoff}"`;
	const { data, error } = await client
		.from('access_requests')
		.select('id')
		.eq('email', normalizeUserEmailIdentity(email))
		.eq('status', 'approved')
		.is('setup_completed_at', null)
		.or(`reviewed_at.gte.${quotedRenewalCutoff},and(reviewed_at.is.null,created_at.gte.${quotedRenewalCutoff})`)
		.order('reviewed_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle<AccessRequestLookupRow>();

	if (error) {
		throw error;
	}

	return data ?? null;
}

async function findReusableAccessRequestForInvitation(
	client: SupabaseClient,
	email: string
): Promise<AccessRequestLookupRow | null> {
	return (await findPendingAccessRequest(client, email)) ?? findApprovedIncompleteAccessRequest(client, email);
}

async function hasCompletedAccessRequestSetupForEmail(
	client: SupabaseClient,
	email: string,
	userId: string | null
): Promise<boolean> {
	const query = client
		.from('access_requests')
		.select('id')
		.eq('email', normalizeUserEmailIdentity(email))
		.eq('status', 'approved')
		.not('setup_completed_at', 'is', null);
	const scopedQuery = userId
		? query.or(`setup_user_id.is.null,setup_user_id.eq.${userId}`)
		: query.is('setup_user_id', null);
	const { data, error } = await scopedQuery.limit(1).maybeSingle<AccessRequestLookupRow>();

	if (error) {
		throw error;
	}

	return Boolean(data?.id);
}

async function insertPendingAccessRequest(
	client: SupabaseClient,
	email: string
): Promise<
	{ status: 'created'; accessRequest: AccessRequestLookupRow } | { status: 'failed'; message: string; error: unknown }
> {
	const normalizedEmail = normalizeUserEmailIdentity(email);
	const { data, error } = await client
		.from('access_requests')
		.insert({
			email: normalizedEmail,
			name: normalizedEmail,
			reason: 'Created from an Organization Invitation.',
			heard_about: 'other',
			heard_about_details: 'Organization Invitation'
		})
		.select('id')
		.single<AccessRequestLookupRow>();

	if (error || !data) {
		return {
			status: 'failed',
			message: error?.message ?? 'Access Request could not be created',
			error
		};
	}

	return { status: 'created', accessRequest: data };
}

async function approveInvitedAccessRequest(
	client: SupabaseClient,
	input: { accessRequestId: string; reviewerId: string }
): Promise<{ status: 'approved' } | { status: 'failed'; message: string }> {
	const { error } = await client
		.from('access_requests')
		.update({
			status: 'approved',
			reviewed_by: input.reviewerId,
			reviewed_at: new Date().toISOString()
		})
		.eq('id', input.accessRequestId)
		.eq('status', 'pending');

	if (error) {
		return { status: 'failed', message: error.message ?? 'Access Request could not be approved' };
	}

	return { status: 'approved' };
}

async function insertAccessRequestInvitationLink(
	client: SupabaseClient,
	input: Parameters<OrganizationSettingsMemberManagementPort['createOrLinkApprovedAccessRequestForInvitation']>[0] & {
		accessRequestId: string;
	}
): Promise<{ status: 'linked' } | { status: 'already-linked' } | { status: 'failed'; message: string }> {
	const { error } = await client.from('access_request_organization_invitation_links').insert({
		access_request_id: input.accessRequestId,
		organization_invitation_id: input.invitationId,
		organization_id: input.organizationId,
		invited_by: input.invitedBy,
		invited_at: input.invitedAt,
		intended_membership_role: input.role,
		intended_member_preset: input.memberPreset,
		intended_capability_overrides: input.capabilityOverrides,
		intended_access_scope_kind: input.accessScopeKind,
		intended_access_scope_group_ids: input.accessScopeGroupIds
	});

	if (!error) {
		return { status: 'linked' };
	}

	if (isUniqueConstraintError(error, 'access_request_organization_invitation_links_invitation_key')) {
		return { status: 'already-linked' };
	}

	return { status: 'failed', message: error.message ?? 'Access Request link could not be created' };
}

function normalizeRevokeStatus(
	status: RevokeOrganizationInvitationRpcRow['revoke_status']
): OrganizationInvitationRevokeResult['status'] {
	if (
		status === 'revoked' ||
		status === 'not_found' ||
		status === 'expired' ||
		status === 'already_accepted' ||
		status === 'already_declined'
	) {
		return status;
	}

	return 'failed';
}

function serializeMembershipUpdate(input: OrganizationMembershipUpdateInput) {
	return {
		role: input.role,
		member_preset: input.memberPreset,
		capability_overrides: input.capabilityOverrides,
		access_scope_kind: input.accessScopeKind,
		access_scope_group_ids: input.accessScopeGroupIds
	};
}
