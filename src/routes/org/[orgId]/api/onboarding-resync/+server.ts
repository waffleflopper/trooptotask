import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';

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
		templateStepId: r.template_step_id ?? null,
		active: (r.active as boolean) ?? true
	};
}

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const { onboardingId, newTemplateId } = await event.request.json();

	// Load the onboarding record
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.select('*')
		.eq('id', onboardingId)
		.eq('organization_id', orgId)
		.single();

	if (onboardingError || !onboarding) throw error(404, 'Onboarding not found');

	// If switching templates, update template_id first
	const targetTemplateId = newTemplateId ?? onboarding.template_id;

	if (newTemplateId && newTemplateId !== onboarding.template_id) {
		const { error: updateError } = await supabase
			.from('personnel_onboardings')
			.update({ template_id: newTemplateId })
			.eq('id', onboardingId);

		if (updateError) throw error(500, updateError.message);
	}

	// Block re-sync if no template assigned (historical record)
	if (!targetTemplateId) {
		throw error(
			422,
			JSON.stringify({
				error: 'resync_unavailable',
				message:
					'This onboarding was started before templates were introduced. Assign it to a template before re-syncing.'
			})
		);
	}

	// Load current template steps
	const { data: templateSteps, error: templateError } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('template_id', targetTemplateId)
		.order('sort_order');

	if (templateError) throw error(500, templateError.message);

	const liveSteps = templateSteps ?? [];
	const liveStepIds = new Set(liveSteps.map((s: Record<string, unknown>) => s.id));

	// Load existing progress rows
	const { data: progressRows, error: progressError } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', onboardingId);

	if (progressError) throw error(500, progressError.message);

	const existing = progressRows ?? [];
	const existingByTemplateStepId = new Map(
		existing
			.filter((p: Record<string, unknown>) => p.template_step_id)
			.map((p: Record<string, unknown>) => [p.template_step_id, p])
	);

	const updates: Promise<{ error: unknown }>[] = [];

	// 1. Add steps that are in the template but not yet in progress
	const newStepRows = liveSteps
		.filter((t: Record<string, unknown>) => !existingByTemplateStepId.has(t.id))
		.map((t: Record<string, unknown>) => ({
			onboarding_id: onboardingId,
			organization_id: orgId,
			step_name: t.name,
			step_type: t.step_type,
			training_type_id: t.training_type_id,
			stages: t.stages,
			sort_order: t.sort_order,
			completed: false,
			current_stage: t.step_type === 'paperwork' && Array.isArray(t.stages) && t.stages.length ? t.stages[0] : null,
			notes: [],
			template_step_id: t.id
		}));

	if (newStepRows.length > 0) {
		updates.push(Promise.resolve(supabase.from('onboarding_step_progress').insert(newStepRows)));
	}

	// 2. Deactivate steps that are in the instance but no longer in the template
	for (const progressRow of existing) {
		if (!progressRow.template_step_id) continue;
		if (!liveStepIds.has(progressRow.template_step_id)) {
			updates.push(
				Promise.resolve(supabase.from('onboarding_step_progress').update({ active: false }).eq('id', progressRow.id))
			);
		}
	}

	// 3. Update snapshot fields on existing steps that still exist in template
	for (const progressRow of existing) {
		if (!progressRow.template_step_id) continue;
		if (!liveStepIds.has(progressRow.template_step_id)) continue;

		const templateStep = liveSteps.find((s: Record<string, unknown>) => s.id === progressRow.template_step_id)!;

		// Always sync snapshot fields and re-activate if previously deactivated
		const updateFields: Record<string, unknown> = {
			step_name: templateStep.name,
			step_type: templateStep.step_type,
			training_type_id: templateStep.training_type_id,
			stages: templateStep.stages,
			sort_order: templateStep.sort_order,
			active: true
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
			Promise.resolve(supabase.from('onboarding_step_progress').update(updateFields).eq('id', progressRow.id))
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

	ctx.audit.log({
		action: newTemplateId ? 'onboarding.template_switched' : 'onboarding_resync.created',
		resourceType: 'onboarding_resync',
		resourceId: onboardingId,
		details: newTemplateId ? { oldTemplateId: onboarding.template_id, newTemplateId } : undefined
	});
	return json({
		onboardingId,
		templateId: targetTemplateId,
		steps: (refreshed ?? []).map(transformStep)
	});
};
