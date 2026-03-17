import type { PageServerLoad } from './$types';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId ? new Set(parentData.personnel.map((p) => p.id)) : null;

	const [templatesRes, templateStepsRes, onboardingsRes] = await Promise.all([
		supabase.from('onboarding_templates').select('*').eq('organization_id', orgId).order('name'),
		supabase.from('onboarding_template_steps').select('*').eq('organization_id', orgId).order('sort_order'),
		supabase
			.from('personnel_onboardings')
			.select('*, onboarding_step_progress(*)')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
	]);

	// Filter onboardings to scoped personnel if group-scoped
	let onboardings = onboardingsRes.data ?? [];
	if (scopedPersonnelIds) {
		onboardings = onboardings.filter((o: Record<string, unknown>) => scopedPersonnelIds.has(o.personnel_id as string));
	}

	const onboardingTemplates = (templatesRes.data ?? []).map((t: Record<string, unknown>) => ({
		id: t.id as string,
		orgId: t.organization_id as string,
		name: t.name as string,
		description: t.description as string | null,
		createdAt: t.created_at as string
	})) as OnboardingTemplate[];

	const onboardingTemplateSteps = (templateStepsRes.data ?? []).map((t: Record<string, unknown>) => ({
		id: t.id as string,
		templateId: t.template_id as string,
		name: t.name as string,
		description: t.description as string | null,
		stepType: t.step_type as string,
		trainingTypeId: t.training_type_id as string | null,
		stages: t.stages as string[] | null,
		sortOrder: t.sort_order as number
	})) as OnboardingTemplateStep[];

	return {
		orgId,
		onboardingTemplates,
		onboardingTemplateSteps,
		onboardings: onboardings.map((o: Record<string, unknown>) => ({
			id: o.id as string,
			personnelId: o.personnel_id as string,
			startedAt: o.started_at as string,
			completedAt: o.completed_at as string | null,
			status: o.status as string,
			templateId: (o.template_id as string | null) ?? null,
			steps: ((o.onboarding_step_progress as Record<string, unknown>[]) ?? [])
				.sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
				.map((s) => ({
					id: s.id as string,
					onboardingId: s.onboarding_id as string,
					stepName: s.step_name as string,
					stepType: s.step_type as string,
					trainingTypeId: s.training_type_id as string | null,
					stages: s.stages as string[] | null,
					sortOrder: s.sort_order as number,
					completed: s.completed as boolean,
					currentStage: s.current_stage as string | null,
					notes: Array.isArray(s.notes) ? s.notes : [],
					templateStepId: (s.template_step_id as string | null) ?? null
				}))
		})) as PersonnelOnboarding[]
	};
};
