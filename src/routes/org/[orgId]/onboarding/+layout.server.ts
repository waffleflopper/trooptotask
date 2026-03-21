import type { LayoutServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { findTemplates, findTemplateSteps, findOnboardings } from '$lib/server/onboardingRepository';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

export const load: LayoutServerLoad = async ({ params, locals, cookies, parent, depends }) => {
	depends('app:onboarding-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId ? new Set(parentData.personnel.map((p) => p.id)) : null;

	const [templatesResult, templateStepsResult, onboardingsResult, personnelTrainings] = await Promise.all([
		findTemplates(supabase, orgId),
		findTemplateSteps(supabase, orgId),
		findOnboardings(supabase, orgId, scopedPersonnelIds),
		PersonnelTrainingEntity.repo.list(supabase, orgId)
	]);

	return {
		orgId,
		onboardingTemplates: templatesResult.data,
		onboardingTemplateSteps: templateStepsResult.data,
		onboardings: onboardingsResult.data,
		personnelTrainings
	};
};
