import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const parentData = await parent();
	const scopedPersonnelIds = parentData.scopedGroupId
		? new Set(parentData.personnel.map((p: any) => p.id))
		: null;

	const [templatesRes, templateStepsRes, onboardingsRes] = await Promise.all([
		supabase
			.from('onboarding_templates')
			.select('*')
			.eq('organization_id', orgId)
			.order('name'),
		supabase
			.from('onboarding_template_steps')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('personnel_onboardings')
			.select('*, onboarding_step_progress(*)')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
	]);

	// Filter onboardings to scoped personnel if group-scoped
	let onboardings = onboardingsRes.data ?? [];
	if (scopedPersonnelIds) {
		onboardings = onboardings.filter((o: any) => scopedPersonnelIds.has(o.personnel_id));
	}

	const onboardingTemplates = (templatesRes.data ?? []).map((t: any) => ({
		id: t.id,
		orgId: t.organization_id,
		name: t.name,
		description: t.description,
		createdAt: t.created_at
	}));

	const onboardingTemplateSteps = (templateStepsRes.data ?? []).map((t: any) => ({
		id: t.id,
		templateId: t.template_id,
		name: t.name,
		description: t.description,
		stepType: t.step_type,
		trainingTypeId: t.training_type_id,
		stages: t.stages,
		sortOrder: t.sort_order
	}));

	return {
		orgId,
		onboardingTemplates,
		onboardingTemplateSteps,
		onboardings: onboardings.map((o: any) => ({
			id: o.id,
			personnelId: o.personnel_id,
			startedAt: o.started_at,
			completedAt: o.completed_at,
			status: o.status,
			templateId: o.template_id ?? null,
			steps: (o.onboarding_step_progress ?? [])
				.sort((a: any, b: any) => a.sort_order - b.sort_order)
				.map((s: any) => ({
					id: s.id,
					onboardingId: s.onboarding_id,
					stepName: s.step_name,
					stepType: s.step_type,
					trainingTypeId: s.training_type_id,
					stages: s.stages,
					sortOrder: s.sort_order,
					completed: s.completed,
					currentStage: s.current_stage,
					notes: Array.isArray(s.notes) ? s.notes : [],
					templateStepId: s.template_step_id ?? null
				}))
		}))
	};
};
