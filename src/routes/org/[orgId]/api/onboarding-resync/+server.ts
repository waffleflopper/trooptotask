import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

function transformStep(r: any) {
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

	const { onboardingId } = await request.json();

	// Load the onboarding record
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.select('*')
		.eq('id', onboardingId)
		.eq('organization_id', orgId)
		.single();

	if (onboardingError || !onboarding) throw error(404, 'Onboarding not found');

	// Block re-sync if no template assigned (historical record)
	if (!onboarding.template_id) {
		throw error(422, JSON.stringify({
			error: 'resync_unavailable',
			message: 'This onboarding was started before templates were introduced. Assign it to a template before re-syncing.'
		}));
	}

	// Load current template steps
	const { data: templateSteps, error: templateError } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('template_id', onboarding.template_id)
		.order('sort_order');

	if (templateError) throw error(500, templateError.message);

	const liveSteps = templateSteps ?? [];
	const liveStepIds = new Set(liveSteps.map((s: any) => s.id));

	// Load existing progress rows
	const { data: progressRows, error: progressError } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', onboardingId);

	if (progressError) throw error(500, progressError.message);

	const existing = progressRows ?? [];
	const existingByTemplateStepId = new Map(
		existing
			.filter((p: any) => p.template_step_id)
			.map((p: any) => [p.template_step_id, p])
	);

	const updates: Promise<{ error: any }>[] = [];

	// 1. Add steps that are in the template but not yet in progress
	const newStepRows = liveSteps
		.filter((t: any) => !existingByTemplateStepId.has(t.id))
		.map((t: any, index: number) => ({
			onboarding_id: onboardingId,
			step_name: t.name,
			step_type: t.step_type,
			training_type_id: t.training_type_id,
			stages: t.stages,
			sort_order: t.sort_order,
			completed: false,
			current_stage: t.step_type === 'paperwork' && t.stages?.length ? t.stages[0] : null,
			notes: [],
			template_step_id: t.id
		}));

	if (newStepRows.length > 0) {
		updates.push(
			Promise.resolve(supabase.from('onboarding_step_progress').insert(newStepRows))
		);
	}

	// 2. Update snapshot fields on existing steps that still exist in template
	for (const progressRow of existing) {
		if (!progressRow.template_step_id) continue;
		if (!liveStepIds.has(progressRow.template_step_id)) continue;

		const templateStep = liveSteps.find((s: any) => s.id === progressRow.template_step_id)!;

		// Always sync snapshot fields (name, type, stages, sort_order) even on completed steps
		const updateFields: Record<string, unknown> = {
			step_name: templateStep.name,
			step_type: templateStep.step_type,
			training_type_id: templateStep.training_type_id,
			stages: templateStep.stages,
			sort_order: templateStep.sort_order
		};

		// For incomplete paperwork steps, reset current_stage if it no longer exists
		if (!progressRow.completed) {
			const stagesChanged = JSON.stringify(templateStep.stages) !== JSON.stringify(progressRow.stages);
			if (stagesChanged && templateStep.step_type === 'paperwork' && templateStep.stages?.length) {
				const currentStageStillValid = templateStep.stages.includes(progressRow.current_stage);
				if (!currentStageStillValid) {
					updateFields.current_stage = templateStep.stages[0];
				}
			}
		}

		updates.push(
			Promise.resolve(
				supabase
					.from('onboarding_step_progress')
					.update(updateFields)
					.eq('id', progressRow.id)
			)
		);
	}

	const results = await Promise.all(updates);
	const failed = results.find((r) => r.error);
	if (failed) throw error(500, 'Failed to sync onboarding steps');

	// Return the refreshed progress rows
	const { data: refreshed, error: refreshError } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', onboardingId)
		.order('sort_order');

	if (refreshError) throw error(500, refreshError.message);

	return json({
		onboardingId,
		steps: (refreshed ?? []).map(transformStep)
	});
};
