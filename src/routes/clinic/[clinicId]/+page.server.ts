import type { PageServerLoad } from './$types';
import type { Personnel, StatusType, AvailabilityEntry, SpecialDay } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import type { Group } from '$lib/stores/groups.svelte';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { clinicId } = params;
	const parentData = await parent();
	const userId = parentData.userId;

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
		locals.supabase
			.from('personnel')
			.select('*, groups(name)')
			.eq('clinic_id', clinicId)
			.order('last_name'),
		locals.supabase
			.from('groups')
			.select('*')
			.eq('clinic_id', clinicId)
			.order('sort_order'),
		locals.supabase
			.from('status_types')
			.select('*')
			.eq('clinic_id', clinicId)
			.order('sort_order'),
		locals.supabase
			.from('availability_entries')
			.select('*')
			.eq('clinic_id', clinicId),
		locals.supabase
			.from('special_days')
			.select('*')
			.eq('clinic_id', clinicId)
			.order('date'),
		locals.supabase
			.from('assignment_types')
			.select('*')
			.eq('clinic_id', clinicId)
			.order('sort_order'),
		locals.supabase
			.from('daily_assignments')
			.select('*')
			.eq('clinic_id', clinicId),
		locals.supabase
			.from('user_pinned_groups')
			.select('*')
			.eq('clinic_id', clinicId)
			.eq('user_id', userId)
			.order('sort_order')
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
		clinicId,
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
