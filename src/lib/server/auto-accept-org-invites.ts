import type { SupabaseClient } from '@supabase/supabase-js';

export async function autoAcceptOrgInvites(
	supabase: SupabaseClient,
	userId: string,
	email: string
): Promise<{ accepted: number }> {
	const { data: invitations } = await supabase
		.from('organization_invitations')
		.select(
			'organization_id, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
		)
		.eq('email', email.toLowerCase())
		.eq('status', 'pending');

	if (!invitations || invitations.length === 0) {
		return { accepted: 0 };
	}

	const normalizedEmail = email.toLowerCase();

	for (const inv of invitations) {
		const isAdminInvite =
			inv.can_view_calendar &&
			inv.can_edit_calendar &&
			inv.can_view_personnel &&
			inv.can_edit_personnel &&
			inv.can_view_training &&
			inv.can_edit_training &&
			inv.can_view_onboarding &&
			inv.can_edit_onboarding &&
			inv.can_view_leaders_book &&
			inv.can_edit_leaders_book &&
			inv.can_manage_members;

		await supabase.from('organization_memberships').insert({
			organization_id: inv.organization_id,
			user_id: userId,
			email: normalizedEmail,
			role: isAdminInvite ? 'admin' : 'member',
			can_view_calendar: inv.can_view_calendar ?? true,
			can_edit_calendar: inv.can_edit_calendar ?? true,
			can_view_personnel: inv.can_view_personnel ?? true,
			can_edit_personnel: inv.can_edit_personnel ?? true,
			can_view_training: inv.can_view_training ?? true,
			can_edit_training: inv.can_edit_training ?? true,
			can_view_onboarding: inv.can_view_onboarding ?? true,
			can_edit_onboarding: inv.can_edit_onboarding ?? true,
			can_view_leaders_book: inv.can_view_leaders_book ?? true,
			can_edit_leaders_book: inv.can_edit_leaders_book ?? true,
			can_manage_members: inv.can_manage_members ?? false,
			scoped_group_id: inv.scoped_group_id ?? null
		});
	}

	await supabase
		.from('organization_invitations')
		.update({ status: 'accepted' })
		.eq('email', normalizedEmail)
		.eq('status', 'pending');

	return { accepted: invitations.length };
}
