import type {
	OrganizationInvitationRevokeResult,
	OrganizationMembershipUpdateInput,
	OrganizationSettingsMemberManagementPort
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { getAdminClient } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

interface OrganizationInvitationLookupRow {
	id: string;
	email?: string;
	created_at?: string;
	expires_at?: string;
	access_request_organization_invitation_links?: Array<{ id: string }> | { id: string } | null;
}

interface AccessRequestLookupRow {
	id: string;
}

interface SupabaseAuthUserRow {
	id: string;
	email?: string;
}

interface OrganizationMembershipLookupRow {
	user_id: string | null;
	role: string | null;
	email: string | null;
	can_manage_members: boolean | null;
}

interface OrganizationRow {
	name: string | null;
}

interface RevokeOrganizationInvitationRpcRow {
	revoke_status: OrganizationInvitationRevokeResult['status'] | null;
	revoked_email: string | null;
}

type MemberPlanLimitGuardRpcClient = {
	rpc(
		fn: 'block_invitation_if_member_cap_exceeded',
		args: {
			p_org_id: string;
			p_invitation_id: string;
			p_blocked_by: string;
			p_member_limit: number;
			p_block_reason: string;
		}
	): Promise<{ data: boolean | null; error: { message?: string } | null }>;
};

const FIND_USER_BY_EMAIL_MAX_PAGES = 20;

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
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
): Promise<{ id: string; email: string } | null> {
	const normalizedEmail = normalizeEmail(email);
	let page = 1;

	// Supabase Auth admin has no targeted email lookup in the installed SDK, so this bounded scan mirrors setup activation.
	while (page <= FIND_USER_BY_EMAIL_MAX_PAGES) {
		const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
		if (error) {
			throw error;
		}

		const user = (data.users as SupabaseAuthUserRow[]).find(
			(candidate) => candidate.email?.toLowerCase() === normalizedEmail
		);
		if (user?.email) {
			return { id: user.id, email: normalizeEmail(user.email) };
		}

		if (data.users.length < 1000) {
			return null;
		}
		page += 1;
	}

	return null;
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
				.select('id, email, expires_at, access_request_organization_invitation_links(id)')
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
					requiresAccountSetup: hasAccessRequestInvitationLink(data)
				};
			}

			return {
				id: data.id,
				email: data.email ?? '',
				status: 'pending',
				requiresAccountSetup: hasAccessRequestInvitationLink(data)
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
					scoped_group_id: input.singleGroupCompatibilityId,
					can_view_calendar: input.permissions.canViewCalendar,
					can_edit_calendar: input.permissions.canEditCalendar,
					can_view_personnel: input.permissions.canViewPersonnel,
					can_edit_personnel: input.permissions.canEditPersonnel,
					can_view_training: input.permissions.canViewTraining,
					can_edit_training: input.permissions.canEditTraining,
					can_view_critical_tasks: input.permissions.canViewCriticalTasks,
					can_edit_critical_tasks: input.permissions.canEditCriticalTasks,
					can_view_onboarding: input.permissions.canViewOnboarding,
					can_edit_onboarding: input.permissions.canEditOnboarding,
					can_view_rating_scheme: input.permissions.canViewRatingScheme,
					can_edit_rating_scheme: input.permissions.canEditRatingScheme,
					can_manage_members: input.permissions.canManageMembers,
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

		async createOrLinkPendingAccessRequestForInvitation(input) {
			const adminSupabase = getAdminClientFn();
			let accessRequest = await findPendingAccessRequest(adminSupabase, input.email);
			let status: 'created' | 'linked' = 'linked';

			if (!accessRequest) {
				const created = await insertPendingAccessRequest(adminSupabase, input.email);
				if (created.status === 'failed') {
					if (isUniqueConstraintError(created.error, 'access_requests_pending_email_idx')) {
						accessRequest = await findPendingAccessRequest(adminSupabase, input.email);
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

			if (link.status === 'already-linked') {
				return { status: 'already-linked', accessRequestId: accessRequest.id };
			}

			if (link.status === 'failed') {
				return { status: 'failed', message: link.message };
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

		async blockInvitationIfMemberPlanLimitExceeded(input) {
			const { data, error } = await (getAdminClientFn() as unknown as MemberPlanLimitGuardRpcClient).rpc(
				'block_invitation_if_member_cap_exceeded',
				{
					p_org_id: input.organizationId,
					p_invitation_id: input.invitationId,
					p_blocked_by: input.blockedBy,
					p_member_limit: input.memberLimit,
					p_block_reason: input.reason
				}
			);

			if (error) {
				return { status: 'failed', message: error.message ?? 'Invitation plan limit guard failed' };
			}

			return data ? { status: 'blocked' } : { status: 'within_limit' };
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
				.select('user_id, role, email, can_manage_members')
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
				canManageMembers: data.role === 'admin' || data.role === 'owner' || data.can_manage_members === true
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

function hasAccessRequestInvitationLink(row: OrganizationInvitationLookupRow): boolean {
	const links = row.access_request_organization_invitation_links;
	return Array.isArray(links) ? links.length > 0 : Boolean(links);
}

async function findPendingAccessRequest(client: SupabaseClient, email: string): Promise<AccessRequestLookupRow | null> {
	const { data, error } = await client
		.from('access_requests')
		.select('id')
		.eq('email', normalizeEmail(email))
		.eq('status', 'pending')
		.maybeSingle<AccessRequestLookupRow>();

	if (error) {
		throw error;
	}

	return data ?? null;
}

async function insertPendingAccessRequest(
	client: SupabaseClient,
	email: string
): Promise<
	{ status: 'created'; accessRequest: AccessRequestLookupRow } | { status: 'failed'; message: string; error: unknown }
> {
	const normalizedEmail = normalizeEmail(email);
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

async function insertAccessRequestInvitationLink(
	client: SupabaseClient,
	input: Parameters<OrganizationSettingsMemberManagementPort['createOrLinkPendingAccessRequestForInvitation']>[0] & {
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
		intended_permissions: input.permissions,
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
