import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { fetchDashboardData } from '$lib/server/dashboardData';
import { getTrainingSummary, getOnboardingTrainingCompletions } from '$lib/server/trainingSummaryService';

export const load: PageServerLoad = async ({ params, locals, cookies, depends, parent }) => {
	depends('app:org-core');
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();

	const [
		dashboardData,
		trainingSummary,
		{ count: onboardingTemplateStepCount },
		{ count: ratingSchemeEntryCount },
		{ count: orgMemberCount },
		{ data: gettingStartedData }
	] = await Promise.all([
		fetchDashboardData(supabase, orgId, userId),
		getTrainingSummary(supabase, orgId, parentData.personnel ?? [], parentData.trainingTypes ?? [], {
			issueLimit: 5,
			issueStatuses: ['expired', 'warning-orange']
		}),
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

	// Get training completions for personnel with active onboardings
	const onboardingPersonnelIds = (dashboardData.activeOnboardings ?? []).map(
		(o: { personnelId: string }) => o.personnelId
	);
	const onboardingTrainingCompletions = await getOnboardingTrainingCompletions(supabase, orgId, onboardingPersonnelIds);

	return {
		orgId,
		...dashboardData,
		trainingSummary,
		onboardingTrainingCompletions: [...onboardingTrainingCompletions],
		onboardingTemplateStepCount: onboardingTemplateStepCount ?? 0,
		ratingSchemeEntryCount: ratingSchemeEntryCount ?? 0,
		orgMemberCount: orgMemberCount ?? 0,
		gettingStartedDismissed: gettingStartedData?.dismissed_at != null
	};
};
