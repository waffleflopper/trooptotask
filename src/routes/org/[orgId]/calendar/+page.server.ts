import type { PageServerLoad } from './$types';
import type { AvailabilityEntry, SpecialDay } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$lib/stores/dutyRosterHistory.svelte';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	// Date range for calendar data (3 months past, 6 months future)
	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
	const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 0);
	const rangeStartStr = formatDate(rangeStart);
	const rangeEndStr = formatDate(rangeEnd);

	const [
		availabilityRes,
		specialDaysRes,
		assignmentTypesRes,
		dailyAssignmentsRes,
		pinnedGroupsRes,
		rosterHistoryRes
	] = await Promise.all([
		supabase
			.from('availability_entries')
			.select('*')
			.eq('organization_id', orgId)
			.gte('end_date', rangeStartStr)
			.lte('start_date', rangeEndStr),
		supabase
			.from('special_days')
			.select('*')
			.eq('organization_id', orgId)
			.gte('date', rangeStartStr)
			.lte('date', rangeEndStr)
			.order('date'),
		supabase
			.from('assignment_types')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('daily_assignments')
			.select('*')
			.eq('organization_id', orgId)
			.gte('date', rangeStartStr)
			.lte('date', rangeEndStr),
		userId
			? supabase
					.from('user_pinned_groups')
					.select('*')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('sort_order')
			: Promise.resolve({ data: [] }),
		supabase
			.from('duty_roster_history')
			.select('*')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
			.limit(50)
	]);

	const availabilityEntries: AvailabilityEntry[] = (availabilityRes.data ?? []).map((a: any) => ({
		id: a.id,
		personnelId: a.personnel_id,
		statusTypeId: a.status_type_id,
		startDate: a.start_date,
		endDate: a.end_date
	}));

	const specialDays: SpecialDay[] = (specialDaysRes.data ?? []).map((d: any) => ({
		id: d.id,
		date: d.date,
		name: d.name,
		type: d.type
	}));

	const assignmentTypes: AssignmentType[] = (assignmentTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		shortName: t.short_name,
		assignTo: t.assign_to,
		color: t.color,
		exemptPersonnelIds: t.exempt_personnel_ids ?? []
	}));

	const dailyAssignments: DailyAssignment[] = (dailyAssignmentsRes.data ?? []).map((a: any) => ({
		id: a.id,
		date: a.date,
		assignmentTypeId: a.assignment_type_id,
		assigneeId: a.assignee_id
	}));

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	const rosterHistory: RosterHistoryItem[] = (rosterHistoryRes.data ?? []).map((r: any) => ({
		id: r.id,
		assignmentTypeId: r.assignment_type_id,
		name: r.name,
		startDate: r.start_date,
		endDate: r.end_date,
		roster: r.roster,
		config: r.config ?? {},
		createdAt: r.created_at
	}));

	return {
		orgId,
		availabilityEntries,
		specialDays,
		assignmentTypes,
		dailyAssignments,
		pinnedGroups,
		rosterHistory
	};
};
