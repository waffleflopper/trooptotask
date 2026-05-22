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
				.select('id, email')
				.eq('id', inviteId)
				.eq('organization_id', orgId)
				.eq('status', 'pending')
				.gt('expires_at', new Date().toISOString())
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return null;
			}

			return { id: data.id, email: data.email ?? '' };
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
				.select('id')
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return { status: 'failed', message: error?.message ?? 'Invitation could not be created' };
			}

			return { status: 'created', invitationId: data.id };
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
				email: data.email
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
	};
}
