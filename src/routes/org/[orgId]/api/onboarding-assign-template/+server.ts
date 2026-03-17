import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

function transformStep(r: Record<string, unknown>) {
	return {
		id: r.id,
		onboardingId: r.onboarding_id,
		stepName: r.step_name,
		stepType: r.step_type,
		trainingTypeId: r.training_type_id,
		stages: r.stages,
		sortOrder: r.sort_order,
		completed: r.completed,
		currentStage: r.current_stage,
		notes: Array.isArray(r.notes) ? r.notes : [],
		templateStepId: r.template_step_id ?? null
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'onboarding');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const { onboardingId, templateId } = await request.json();

	// Verify onboarding belongs to org
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.select('*')
		.eq('id', onboardingId)
		.eq('organization_id', orgId)
		.single();

	if (onboardingError || !onboarding) throw error(404, 'Onboarding not found');

	// Verify template belongs to org
	const { data: template, error: templateError } = await supabase
		.from('onboarding_templates')
		.select('id')
		.eq('id', templateId)
		.eq('organization_id', orgId)
		.single();

	if (templateError || !template) throw error(404, 'Template not found');

	// Load template steps for backfilling
	const { data: templateSteps, error: stepsError } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('template_id', templateId)
		.order('sort_order');

	if (stepsError) throw error(500, stepsError.message);

	const liveSteps = templateSteps ?? [];

	// Load existing progress rows
	const { data: progressRows, error: progressError } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', onboardingId);

	if (progressError) throw error(500, progressError.message);

	const existing = progressRows ?? [];

	// Write template_id to the onboarding and backfill step links in parallel
	const updates: Promise<{ error: unknown }>[] = [
		Promise.resolve(supabase.from('personnel_onboardings').update({ template_id: templateId }).eq('id', onboardingId))
	];

	// Backfill template_step_id by matching on (step_name, step_type)
	for (const progressRow of existing) {
		if (progressRow.template_step_id) continue; // Already linked

		const match = liveSteps.find(
			(t: Record<string, unknown>) => t.name === progressRow.step_name && t.step_type === progressRow.step_type
		);

		if (match) {
			updates.push(
				Promise.resolve(
					supabase.from('onboarding_step_progress').update({ template_step_id: match.id }).eq('id', progressRow.id)
				)
			);
		}
	}

	const results = await Promise.all(updates);
	const failed = results.find((r) => r.error);
	if (failed) throw error(500, 'Failed to assign template');

	// Return refreshed progress rows
	const { data: refreshed, error: refreshError } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', onboardingId)
		.order('sort_order');

	if (refreshError) throw error(500, refreshError.message);

	return json({
		onboardingId,
		templateId,
		steps: (refreshed ?? []).map(transformStep)
	});
};
