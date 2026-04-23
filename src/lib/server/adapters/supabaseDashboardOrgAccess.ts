import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import type {
	DashboardInvitationRecord,
	DashboardMembershipCreateInput,
	DashboardOrgAccessPort,
	DashboardOrganizationSummary,
	DashboardPendingInvitationSummary
} from '$lib/server/core/useCases/dashboardOrgAccess';

interface OrganizationMembershipRow {
	organization_id: string;
	role: string;
	organizations: {
		id: string;
		name: string;
	} | null;
}

interface OrganizationInvitationSummaryRow {
	id: string;
	organization_id: string;
	created_at: string;
	organizations: {
		id: string;
		name: string;
	} | null;
}

interface OrganizationInvitationRow {
	id: string;
	organization_id: string;
	can_view_calendar: boolean | null;
	can_edit_calendar: boolean | null;
	can_view_personnel: boolean | null;
	can_edit_personnel: boolean | null;
	can_view_training: boolean | null;
	can_edit_training: boolean | null;
	can_view_critical_tasks: boolean | null;
	can_edit_critical_tasks: boolean | null;
	can_view_onboarding: boolean | null;
	can_edit_onboarding: boolean | null;
	can_view_leaders_book: boolean | null;
	can_edit_leaders_book: boolean | null;
	can_manage_members: boolean | null;
	scoped_group_id: string | null;
}

export function createSupabaseDashboardOrgAccessPort(locals: Pick<App.Locals, 'supabase'>): DashboardOrgAccessPort {
	const supabase = locals.supabase;

	return {
		async listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]> {
			const { data, error } = await selectAllSupabaseRows<OrganizationMembershipRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('organization_id, role, organizations(id, name)')
						.eq('user_id', userId)
						.range(from, to) as unknown as Promise<{
						data: OrganizationMembershipRow[] | null;
						error: unknown;
					}>
			);

			if (error || !data) {
				return [];
			}

			return data
				.filter((membership) => membership.organizations)
				.map((membership) => ({
					id: membership.organizations!.id,
					name: membership.organizations!.name,
					role: membership.role
				}));
		},

		async listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]> {
			const { data, error } = await selectAllSupabaseRows<OrganizationInvitationSummaryRow>(
				(from, to) =>
					supabase
						.from('organization_invitations')
						.select('id, organization_id, created_at, organizations(id, name)')
						.eq('email', email)
						.eq('status', 'pending')
						.order('created_at', { ascending: false })
						.range(from, to) as unknown as Promise<{
						data: OrganizationInvitationSummaryRow[] | null;
						error: unknown;
					}>
			);

			if (error || !data) {
				return [];
			}

			return data
				.filter((invitation) => invitation.organizations)
				.map((invitation) => ({
					id: invitation.id,
					organizationId: invitation.organization_id,
					organizationName: invitation.organizations!.name,
					createdAt: invitation.created_at
				}));
		},

		async findPendingInvitation(invitationId: string, email: string): Promise<DashboardInvitationRecord | null> {
			const { data, error } = await supabase
				.from('organization_invitations')
				.select(
					'id, organization_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_critical_tasks, can_edit_critical_tasks, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
				)
				.eq('id', invitationId)
				.eq('email', email)
				.single<OrganizationInvitationRow>();

			if (error || !data) {
				return null;
			}

			return {
				id: data.id,
				organizationId: data.organization_id,
				canViewCalendar: data.can_view_calendar,
				canEditCalendar: data.can_edit_calendar,
				canViewPersonnel: data.can_view_personnel,
				canEditPersonnel: data.can_edit_personnel,
				canViewTraining: data.can_view_training,
				canEditTraining: data.can_edit_training,
				canViewCriticalTasks: data.can_view_critical_tasks,
				canEditCriticalTasks: data.can_edit_critical_tasks,
				canViewOnboarding: data.can_view_onboarding,
				canEditOnboarding: data.can_edit_onboarding,
				canViewLeadersBook: data.can_view_leaders_book,
				canEditLeadersBook: data.can_edit_leaders_book,
				canManageMembers: data.can_manage_members,
				scopedGroupId: data.scoped_group_id
			};
		},

		async hasMembership(organizationId: string, userId: string): Promise<boolean> {
			const { data } = await supabase
				.from('organization_memberships')
				.select('id')
				.eq('organization_id', organizationId)
				.eq('user_id', userId)
				.single();

			return !!data;
		},

		async createMembership(input: DashboardMembershipCreateInput): Promise<boolean> {
			const { error } = await supabase.from('organization_memberships').insert({
				organization_id: input.organizationId,
				user_id: input.userId,
				email: input.email,
				role: input.role,
				can_view_calendar: input.canViewCalendar,
				can_edit_calendar: input.canEditCalendar,
				can_view_personnel: input.canViewPersonnel,
				can_edit_personnel: input.canEditPersonnel,
				can_view_training: input.canViewTraining,
				can_edit_training: input.canEditTraining,
				can_view_critical_tasks: input.canViewCriticalTasks,
				can_edit_critical_tasks: input.canEditCriticalTasks,
				can_view_onboarding: input.canViewOnboarding,
				can_edit_onboarding: input.canEditOnboarding,
				can_view_leaders_book: input.canViewLeadersBook,
				can_edit_leaders_book: input.canEditLeadersBook,
				can_manage_members: input.canManageMembers,
				scoped_group_id: input.scopedGroupId
			});

			return !error;
		},

		async deleteInvitation(invitationId: string): Promise<void> {
			await supabase.from('organization_invitations').delete().eq('id', invitationId);
		},

		async deleteInvitationForEmail(invitationId: string, email: string): Promise<boolean> {
			const { error } = await supabase
				.from('organization_invitations')
				.delete()
				.eq('id', invitationId)
				.eq('email', email);

			return !error;
		}
	};
}
