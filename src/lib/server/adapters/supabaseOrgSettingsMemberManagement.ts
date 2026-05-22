import type {
	OrganizationMembershipUpdateInput,
	OrganizationSettingsMemberManagementPort
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { getAdminClient } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

interface OrganizationInvitationLookupRow {
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
				.single<OrganizationInvitationLookupRow>();

			if (error || !data) {
				return null;
			}

			return { id: data.id };
		},

		async createInvitation(input) {
			const { error } = await supabase.from('organization_invitations').insert({
				organization_id: input.organizationId,
				email: input.email,
				invited_by: input.invitedBy,
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
			});

			return error?.message ?? null;
		},

		async revokeInvitation(orgId, inviteId) {
			const { error } = await supabase
				.from('organization_invitations')
				.delete()
				.eq('id', inviteId)
				.eq('organization_id', orgId);

			return error?.message ?? null;
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
