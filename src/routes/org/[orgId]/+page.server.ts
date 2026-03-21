import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';
import {
	transformAvailabilityEntries,
	transformAssignmentTypes,
	transformDailyAssignments
} from '$lib/server/transforms';
import { ratingSchemeRepo } from '$lib/server/repositories';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:shared-data');
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	// Fetch ±1 day to cover timezone differences (server is UTC, client may not be)
	const serverNow = new Date();
	const yesterday = formatDate(new Date(serverNow.getTime() - 24 * 60 * 60 * 1000));
	const twoWeeksOut = formatDate(new Date(serverNow.getTime() + 15 * 24 * 60 * 60 * 1000));

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder type
	const excludeCompleted = (q: any) => q.neq('status', 'completed');

	const [
		availabilityRes,
		assignmentTypesRes,
		todayAssignmentsRes,
		pinnedGroupsRes,
		onboardingsRes,
		ratingSchemeEntries
	] = await Promise.all([
		supabase
			.from('availability_entries')
			.select('*')
			.eq('organization_id', orgId)
			.gte('end_date', yesterday)
			.lte('start_date', twoWeeksOut),
		supabase.from('assignment_types').select('*').eq('organization_id', orgId).order('sort_order'),
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
			.select('*, onboarding_step_progress(*)')
			.eq('organization_id', orgId)
			.eq('status', 'in_progress')
			.order('created_at', { ascending: false }),
		ratingSchemeRepo.list(supabase, orgId, {
			select: 'id, rated_person_id, eval_type, rating_period_end, status',
			filters: [excludeCompleted]
		})
	]);

	const availabilityEntries = transformAvailabilityEntries(availabilityRes.data ?? []);
	const assignmentTypes = transformAssignmentTypes(assignmentTypesRes.data ?? []);
	const todayAssignments = transformDailyAssignments(todayAssignmentsRes.data ?? []);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map(
		(p: Record<string, unknown>) => p.group_name as string
	);

	const activeOnboardings = (onboardingsRes.data ?? []).map((o: Record<string, unknown>) => ({
		id: o.id,
		personnelId: o.personnel_id,
		status: o.status,
		startedAt: o.started_at,
		steps: ((o.onboarding_step_progress as Record<string, unknown>[]) ?? [])
			.sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
			.map((s) => ({
				id: s.id,
				stepName: s.step_name,
				stepType: s.step_type,
				trainingTypeId: s.training_type_id,
				completed: s.completed,
				sortOrder: s.sort_order
			}))
	}));

	// Getting Started checklist data
	const [
		{ count: onboardingTemplateStepCount },
		{ count: ratingSchemeEntryCount },
		{ count: orgMemberCount },
		{ data: gettingStartedData }
	] = await Promise.all([
		supabase.from('onboarding_template_steps').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
		supabase.from('rating_scheme_entries').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
		supabase.from('organization_memberships').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
		supabase
			.from('getting_started_progress')
			.select('dismissed_at')
			.eq('organization_id', orgId)
			.eq('user_id', userId)
			.maybeSingle()
	]);

	return {
		orgId,
		availabilityEntries,
		assignmentTypes,
		todayAssignments,
		pinnedGroups,
		activeOnboardings,
		ratingSchemeEntries,
		onboardingTemplateStepCount: onboardingTemplateStepCount ?? 0,
		ratingSchemeEntryCount: ratingSchemeEntryCount ?? 0,
		orgMemberCount: orgMemberCount ?? 0,
		gettingStartedDismissed: gettingStartedData?.dismissed_at != null
	};
};
