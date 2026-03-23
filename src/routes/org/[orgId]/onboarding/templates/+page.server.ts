import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();

	const [templates, templateSteps] = await Promise.all([
		OnboardingTemplateEntity.repo.list(supabase, orgId),
		OnboardingTemplateStepEntity.repo.list(supabase, orgId)
	]);

	return {
		orgId,
		templates,
		templateSteps,
		trainingTypes: parentData.trainingTypes
	};
};
