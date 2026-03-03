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

	const [availabilityRes, assignmentTypesRes, todayAssignmentsRes, pinnedGroupsRes, onboardingsRes] =
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
				: Promise.resolve({ data: [] }),
			supabase
				.from('personnel_onboardings')
				.select('*')
				.eq('organization_id', orgId)
				.eq('status', 'in_progress')
				.order('created_at', { ascending: false })
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

	// Fetch step progress for active onboardings
	const onboardings = onboardingsRes.data ?? [];
	let allSteps: any[] = [];
	if (onboardings.length > 0) {
		const onboardingIds = onboardings.map((o: any) => o.id);
		const { data: steps } = await supabase
			.from('onboarding_step_progress')
			.select('*')
			.in('onboarding_id', onboardingIds)
			.order('sort_order');
		allSteps = steps ?? [];
	}

	// Group steps by onboarding_id
	const stepsByOnboarding = new Map<string, any[]>();
	for (const step of allSteps) {
		const existing = stepsByOnboarding.get(step.onboarding_id) ?? [];
		existing.push(step);
		stepsByOnboarding.set(step.onboarding_id, existing);
	}

	const activeOnboardings = onboardings.map((o: any) => ({
		id: o.id,
		personnelId: o.personnel_id,
		status: o.status,
		startedAt: o.started_at,
		steps: (stepsByOnboarding.get(o.id) ?? []).map((s: any) => ({
			id: s.id,
			stepName: s.step_name,
			stepType: s.step_type,
			trainingTypeId: s.training_type_id,
			completed: s.completed,
			sortOrder: s.sort_order
		}))
	}));

	return {
		orgId,
		today,
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups,
		activeOnboardings
	};
};
