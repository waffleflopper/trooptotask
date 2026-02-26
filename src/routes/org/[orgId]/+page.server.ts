import type { PageServerLoad } from './$types';
import type { Personnel, StatusType, AvailabilityEntry, TrainingType, PersonnelTraining } from '$lib/types';
import type { AssignmentType, DailyAssignment } from '$lib/stores/dailyAssignments.svelte';
import type { Group } from '$lib/stores/groups.svelte';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';

export const load: PageServerLoad = async ({ params, locals, parent, cookies }) => {
	const { orgId } = params;
	const parentData = await parent();
	const userId = parentData.userId;
	const supabase = getSupabaseClient(locals, cookies);

	const today = formatDate(new Date());
	const twoWeeksOut = formatDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

	const [
		personnelRes,
		groupsRes,
		statusTypesRes,
		availabilityRes,
		assignmentTypesRes,
		todayAssignmentsRes,
		trainingTypesRes,
		personnelTrainingsRes,
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
		supabase
			.from('training_types')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('personnel_trainings')
			.select('*')
			.eq('organization_id', orgId),
		userId
			? supabase
					.from('user_pinned_groups')
					.select('*')
					.eq('organization_id', orgId)
					.eq('user_id', userId)
					.order('sort_order')
			: Promise.resolve({ data: [] })
	]);

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

	const groups: Group[] = (groupsRes.data ?? []).map((g: any) => ({
		id: g.id,
		name: g.name,
		sortOrder: g.sort_order
	}));

	const statusTypes: StatusType[] = (statusTypesRes.data ?? []).map((s: any) => ({
		id: s.id,
		name: s.name,
		color: s.color,
		textColor: s.text_color
	}));

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

	const trainingTypes: TrainingType[] = (trainingTypesRes.data ?? []).map((t: any) => ({
		id: t.id,
		name: t.name,
		description: t.description,
		expirationMonths: t.expiration_months,
		warningDaysYellow: t.warning_days_yellow,
		warningDaysOrange: t.warning_days_orange,
		requiredForRoles: t.required_for_roles ?? [],
		color: t.color,
		sortOrder: t.sort_order,
		expirationDateOnly: t.expiration_date_only ?? false
	}));

	const personnelTrainings: PersonnelTraining[] = (personnelTrainingsRes.data ?? []).map(
		(t: any) => ({
			id: t.id,
			personnelId: t.personnel_id,
			trainingTypeId: t.training_type_id,
			completionDate: t.completion_date,
			expirationDate: t.expiration_date,
			notes: t.notes,
			certificateUrl: t.certificate_url
		})
	);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	return {
		orgId,
		today,
		personnel,
		groups,
		statusTypes,
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		trainingTypes,
		personnelTrainings,
		pinnedGroups
	};
};
