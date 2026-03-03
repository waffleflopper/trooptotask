import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);

	const [templateRes, onboardingsRes] = await Promise.all([
		supabase
			.from('onboarding_template_steps')
			.select('*')
			.eq('organization_id', orgId)
			.order('sort_order'),
		supabase
			.from('personnel_onboardings')
			.select('*')
			.eq('organization_id', orgId)
			.order('created_at', { ascending: false })
	]);

	const onboardings = onboardingsRes.data ?? [];

	// Fetch step progress for all onboardings
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

	return {
		orgId,
		onboardingTemplateSteps: (templateRes.data ?? []).map((t: any) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			stepType: t.step_type,
			trainingTypeId: t.training_type_id,
			stages: t.stages,
			sortOrder: t.sort_order
		})),
		onboardings: onboardings.map((o: any) => ({
			id: o.id,
			personnelId: o.personnel_id,
			startedAt: o.started_at,
			completedAt: o.completed_at,
			status: o.status,
			steps: (stepsByOnboarding.get(o.id) ?? []).map((s: any) => ({
				id: s.id,
				onboardingId: s.onboarding_id,
				stepName: s.step_name,
				stepType: s.step_type,
				trainingTypeId: s.training_type_id,
				stages: s.stages,
				sortOrder: s.sort_order,
				completed: s.completed,
				currentStage: s.current_stage,
				notes: s.notes ?? []
			}))
		}))
	};
};
