import type { PageServerLoad } from './$types';
import type { AvailabilityEntry } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	const today = formatDate(new Date());
	const twoWeeksOut = formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

	const [availabilityRes, assignmentTypesRes, todayAssignmentsRes, pinnedGroupsRes] =
		await Promise.all([
			supabase
				.from('availability_entries')
				.select('*')
				.eq('organization_id', orgId)
				.gte('end_date', today)
				.lte('start_date', twoWeeksOut),
			supabase
				.from('assignment_types')
				.select('*')
				.eq('organization_id', orgId)
				.order('sort_order'),
			supabase
				.from('daily_assignments')
				.select('*')
				.eq('organization_id', orgId)
				.eq('date', today),
			userId
				? supabase
						.from('user_pinned_groups')
						.select('*')
						.eq('organization_id', orgId)
						.eq('user_id', userId)
						.order('sort_order')
				: Promise.resolve({ data: [] })
		]);

	const availabilityEntries: AvailabilityEntry[] = (availabilityRes.data ?? []).map((a: any) => ({
		id: a.id,
		personnelId: a.personnel_id,
		statusTypeId: a.status_type_id,
		startDate: a.start_date,
		endDate: a.end_date
	}));

	const assignmentTypes: AssignmentType[] = (assignmentTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		shortName: t.short_name,
		assignTo: t.assign_to,
		color: t.color,
		exemptPersonnelIds: t.exempt_personnel_ids ?? []
	}));

	const todayAssignments: DailyAssignment[] = (todayAssignmentsRes.data ?? []).map((a: any) => ({
		id: a.id,
		date: a.date,
		assignmentTypeId: a.assignment_type_id,
		assigneeId: a.assignee_id
	}));

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	return {
		orgId,
		today,
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups
	};
};
