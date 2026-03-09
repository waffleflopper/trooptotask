import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';
import {
	transformAvailabilityEntries,
	transformAssignmentTypes,
	transformDailyAssignments
} from '$lib/server/transforms';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	// Fetch ±1 day to cover timezone differences (server is UTC, client may not be)
	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	const [availabilityRes, assignmentTypesRes, todayAssignmentsRes, pinnedGroupsRes, onboardingsRes, ratingSchemeRes] =
		await Promise.all([
			supabase
				.from('availability_entries')
				.select('*')
				.eq('organization_id', orgId)
				.gte('end_date', yesterday)
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
				.gte('date', yesterday)
				.lte('date', twoWeeksOut),
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
				.order('created_at', { ascending: false }),
			supabase
				.from('rating_scheme_entries')
				.select('id, rated_person_id, eval_type, rating_period_end, status')
				.eq('organization_id', orgId)
				.neq('status', 'completed')
				.order('rating_period_end')
		]);

	const availabilityEntries = transformAvailabilityEntries(availabilityRes.data ?? []);
	const assignmentTypes = transformAssignmentTypes(assignmentTypesRes.data ?? []);
	const todayAssignments = transformDailyAssignments(todayAssignmentsRes.data ?? []);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map((p: any) => p.group_name);

	const ratingSchemeEntries = (ratingSchemeRes.data ?? []).map((r: any) => ({
		id: r.id,
		ratedPersonId: r.rated_person_id,
		evalType: r.eval_type,
		ratingPeriodEnd: r.rating_period_end,
		status: r.status
	}));

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
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups,
		activeOnboardings,
		ratingSchemeEntries
	};
};
