import type { PageServerLoad } from './$types';
import type { Personnel, StatusType, AvailabilityEntry, SpecialDay } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import type { Group } from '$lib/stores/groups.svelte';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, parent, cookies }) => {
	const { orgId } = params;
	const parentData = await parent();
	const userId = parentData.userId;
	const supabase = getSupabaseClient(locals, cookies);

	// Date range for calendar data (3 months past, 6 months future)
	// This prevents loading unbounded historical data
	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
	const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 0); // End of 6 months from now
	const rangeStartStr = rangeStart.toISOString().split('T')[0];
	const rangeEndStr = rangeEnd.toISOString().split('T')[0];

	// Load all data in parallel
	const [
		personnelRes,
		groupsRes,
		statusTypesRes,
		availabilityRes,
		specialDaysRes,
		assignmentTypesRes,
		dailyAssignmentsRes,
		pinnedGroupsRes
	] = await Promise.all([
		supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('organization_id', orgId)
			.order('last_name'),
		supabase
			.from('groups')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('status_types')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
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
		userId ? supabase
			.from('user_pinned_groups')
			.select('*')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.order('sort_order') : Promise.resolve({ data: [] })
	]);

	// Transform personnel data
	const personnel: Personnel[] = (personnelRes.data ?? []).map((p: any) => ({
		id: p.id,
		rank: p.rank,
		lastName: p.last_name,
		firstName: p.first_name,
		mos: p.mos ?? '',
		clinicRole: p.clinic_role,
		groupId: p.group_id,
		groupName: p.groups?.name ?? ''
	}));

	// Transform groups data
	const groups: Group[] = (groupsRes.data ?? []).map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));

	// Transform status types
	const statusTypes: StatusType[] = (statusTypesRes.data ?? []).map((s: any) => ({
		id: s.id,
		name: s.name,
		color: s.color,
		textColor: s.text_color
	}));

	// Transform availability entries
	const availabilityEntries: AvailabilityEntry[] = (availabilityRes.data ?? []).map((a: any) => ({
		id: a.id,
		personnelId: a.personnel_id,
		statusTypeId: a.status_type_id,
		startDate: a.start_date,
		endDate: a.end_date
	}));

	// Transform special days
	const specialDays: SpecialDay[] = (specialDaysRes.data ?? []).map((d: any) => ({
		id: d.id,
		date: d.date,
		name: d.name,
		type: d.type
	}));

	// Transform assignment types
	const assignmentTypes: AssignmentType[] = (assignmentTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		shortName: t.short_name,
		assignTo: t.assign_to,
		color: t.color
	}));

	// Transform daily assignments
	const dailyAssignments: DailyAssignment[] = (dailyAssignmentsRes.data ?? []).map((a: any) => ({
		id: a.id,
		date: a.date,
		assignmentTypeId: a.assignment_type_id,
		assigneeId: a.assignee_id
	}));

	// Transform pinned groups (just the group names in order)
	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	return {
		orgId,
		personnel,
		groups,
		statusTypes,
		availabilityEntries,
		specialDays,
		assignmentTypes,
		dailyAssignments,
		pinnedGroups
	};
};
