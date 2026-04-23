import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from './supabasePagination';
import { deriveMembershipFromInvitation } from '$lib/server/core/useCases/organizationInvitationMembership';

interface PendingOrgInvitation {
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

export async function autoAcceptOrgInvites(
	supabase: SupabaseClient,
	userId: string,
	email: string
): Promise<{ accepted: number }> {
	const normalizedEmail = email.toLowerCase();

	const { data: invitations } = await selectAllSupabaseRows<PendingOrgInvitation>(
		(from, to) =>
			supabase
				.from('organization_invitations')
				.select(
					'organization_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_critical_tasks, can_edit_critical_tasks, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
				)
				.eq('email', normalizedEmail)
				.eq('status', 'pending')
				.range(from, to) as unknown as Promise<{
				data: PendingOrgInvitation[] | null;
				error: unknown;
			}>
	);

	if (!invitations || invitations.length === 0) {
		return { accepted: 0 };
	}
	const acceptedOrgIds: string[] = [];

	for (const inv of invitations) {
		const membership = deriveMembershipFromInvitation({
			invitation: {
				organizationId: inv.organization_id,
				canViewCalendar: inv.can_view_calendar,
				canEditCalendar: inv.can_edit_calendar,
				canViewPersonnel: inv.can_view_personnel,
				canEditPersonnel: inv.can_edit_personnel,
				canViewTraining: inv.can_view_training,
				canEditTraining: inv.can_edit_training,
				canViewCriticalTasks: inv.can_view_critical_tasks,
				canEditCriticalTasks: inv.can_edit_critical_tasks,
				canViewOnboarding: inv.can_view_onboarding,
				canEditOnboarding: inv.can_edit_onboarding,
				canViewLeadersBook: inv.can_view_leaders_book,
				canEditLeadersBook: inv.can_edit_leaders_book,
				canManageMembers: inv.can_manage_members,
				scopedGroupId: inv.scoped_group_id
			},
			userId,
			email: normalizedEmail
		});

		const { error: insertError } = await supabase.from('organization_memberships').insert({
			organization_id: membership.organizationId,
			user_id: membership.userId,
			email: membership.email,
			role: membership.role,
			can_view_calendar: membership.canViewCalendar,
			can_edit_calendar: membership.canEditCalendar,
			can_view_personnel: membership.canViewPersonnel,
			can_edit_personnel: membership.canEditPersonnel,
			can_view_training: membership.canViewTraining,
			can_edit_training: membership.canEditTraining,
			can_view_critical_tasks: membership.canViewCriticalTasks,
			can_edit_critical_tasks: membership.canEditCriticalTasks,
			can_view_onboarding: membership.canViewOnboarding,
			can_edit_onboarding: membership.canEditOnboarding,
			can_view_leaders_book: membership.canViewLeadersBook,
			can_edit_leaders_book: membership.canEditLeadersBook,
			can_manage_members: membership.canManageMembers,
			scoped_group_id: membership.scopedGroupId
		});

		if (!insertError) {
			acceptedOrgIds.push(inv.organization_id);
		}
	}

	if (acceptedOrgIds.length > 0) {
		await supabase
			.from('organization_invitations')
			.update({ status: 'accepted' })
			.eq('email', normalizedEmail)
			.in('organization_id', acceptedOrgIds);
	}

	return { accepted: acceptedOrgIds.length };
}
