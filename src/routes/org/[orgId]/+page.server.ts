import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { fetchDashboardData } from '$lib/server/dashboardData';
import { personnelTrainingRepo } from '$lib/server/repositories';
import { personnelIds } from '$lib/server/personnelRepository';

export const load: PageServerLoad = async ({ params, locals, cookies, depends, parent }) => {
	depends('app:org-core');
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedGroupId = parentData.scopedGroupId ?? null;

	const [
		dashboardData,
		allTrainings,
		{ count: onboardingTemplateStepCount },
		{ count: ratingSchemeEntryCount },
		{ count: orgMemberCount },
		{ data: gettingStartedData }
	] = await Promise.all([
		fetchDashboardData(supabase, orgId, userId),
		personnelTrainingRepo.list(supabase, orgId),
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

	let personnelTrainings = allTrainings;
	if (scopedGroupId) {
		const scopedIds = new Set(personnelIds(parentData.personnel ?? []));
		personnelTrainings = allTrainings.filter((pt) => scopedIds.has(pt.personnelId));
	}

	return {
		orgId,
		...dashboardData,
		personnelTrainings,
		onboardingTemplateStepCount: onboardingTemplateStepCount ?? 0,
		ratingSchemeEntryCount: ratingSchemeEntryCount ?? 0,
		orgMemberCount: orgMemberCount ?? 0,
		gettingStartedDismissed: gettingStartedData?.dismissed_at != null
	};
};
