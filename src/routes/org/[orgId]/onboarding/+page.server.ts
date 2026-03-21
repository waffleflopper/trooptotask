import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { findTemplates, findTemplateSteps, findOnboardings } from '$lib/server/onboardingRepository';

export const load: PageServerLoad = async ({ params, locals, cookies, parent, depends }) => {
	depends('app:shared-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId ? new Set(parentData.personnel.map((p) => p.id)) : null;

	const [templatesResult, templateStepsResult, onboardingsResult] = await Promise.all([
		findTemplates(supabase, orgId),
		findTemplateSteps(supabase, orgId),
		findOnboardings(supabase, orgId, scopedPersonnelIds)
	]);

	return {
		orgId,
		onboardingTemplates: templatesResult.data,
		onboardingTemplateSteps: templateStepsResult.data,
		onboardings: onboardingsResult.data
	};
};
