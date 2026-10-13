import type {
	OrganizationInvitationRevokeResult,
	OrganizationMembershipUpdateInput,
	OrganizationSettingsMemberManagementPort
} from './memberManagement.server';
import { getAdminClient } from '$lib/server/supabase';
import {
	findInvitationRecipientAccount,
	findUserEmailIdentityByEmail,
	normalizeUserEmailIdentity
} from '$features/identity/index.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUUID } from '$lib/server/validation';

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

interface LinkInvitationAccessRequestRpcRow {
	bridge_status: 'created' | 'linked' | 'already-linked' | 'invitation-not-pending' | null;
	access_request_id: string | null;
}

interface RevokeOrganizationInvitationRpcRow {
	revoke_status: OrganizationInvitationRevokeResult['status'] | null;
	revoked_email: string | null;
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
			return findInvitationRecipientAccount(getAdminClientFn(), email);
		},

		async createOrLinkApprovedAccessRequestForInvitation(input) {
			const { data, error } = await getAdminClientFn()
				.rpc('link_organization_invitation_access_request', {
					p_invitation_id: input.invitationId,
					p_organization_id: input.organizationId,
					p_email: input.email,
					p_invited_by: input.invitedBy,
					p_invited_at: input.invitedAt,
					p_role: input.role,
					p_member_preset: input.memberPreset,
					p_capability_overrides: input.capabilityOverrides,
					p_access_scope_kind: input.accessScopeKind,
					p_access_scope_group_ids: input.accessScopeGroupIds
				})
				.single<LinkInvitationAccessRequestRpcRow>();

			if (error || !data) {
				return { status: 'failed', message: error?.message ?? 'Access Request could not be linked' };
			}
			if (data.bridge_status === 'invitation-not-pending') {
				return { status: 'invitation-not-pending' };
			}
			if (
				(data.bridge_status === 'created' ||
					data.bridge_status === 'linked' ||
					data.bridge_status === 'already-linked') &&
				data.access_request_id
			) {
				return { status: data.bridge_status, accessRequestId: data.access_request_id };
			}
			return { status: 'failed', message: 'Access Request link returned an unexpected result' };
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
				.returns<OrganizationInvitationLookupRow[]>();

			if (error || !data) {
				return { status: 'failed', message: error?.message ?? 'Invitation could not be blocked' };
			}

			return data.length > 0 ? { status: 'blocked' } : { status: 'not-pending' };
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

		async removeMembership(orgId, membershipId, expectedRole) {
			const failure = 'Membership could not be removed';
			if (expectedRole !== 'member' && expectedRole !== 'admin') return failure;
			try {
				const { data, error } = await getAdminClientFn()
					.from('organization_memberships')
					.delete()
					.eq('id', membershipId)
					.eq('organization_id', orgId)
					.eq('role', expectedRole)
					.select('id');
				return !error && acknowledgesMembership(data, membershipId) ? null : failure;
			} catch {
				return failure;
			}
		},

		async updateMembership(input) {
			const failure = 'Membership access could not be updated';
			if (input.expectedRole !== 'member' && input.expectedRole !== 'admin') return failure;
			try {
				const { data, error } = await supabase
					.from('organization_memberships')
					.update(serializeMembershipUpdate(input))
					.eq('id', input.membershipId)
					.eq('organization_id', input.organizationId)
					.eq('role', input.expectedRole)
					.select('id');
				return !error && acknowledgesMembership(data, input.membershipId) ? null : failure;
			} catch {
				return failure;
			}
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
		},

		async findOrganizationGroupIds(orgId, groupIds) {
			const { data, error } = await supabase
				.from('groups')
				.select('id')
				.eq('organization_id', orgId)
				.in('id', groupIds)
				.returns<Array<{ id: string }>>();

			if (error) {
				throw new Error('Organization groups could not be checked');
			}

			return (data ?? []).map((row) => row.id);
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

function acknowledgesMembership(data: unknown, membershipId: string): boolean {
	if (!Array.isArray(data) || data.length !== 1 || data[0] === null || typeof data[0] !== 'object') return false;
	const acknowledgedId = Reflect.get(data[0], 'id');
	return (
		typeof acknowledgedId === 'string' &&
		validateUUID(acknowledgedId) &&
		validateUUID(membershipId) &&
		acknowledgedId.toLowerCase() === membershipId.toLowerCase()
	);
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
