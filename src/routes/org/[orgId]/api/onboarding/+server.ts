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
		notes: Array.isArray(r.notes) ? r.notes : []
	};
}

function transformOnboarding(r: any, steps: any[]) {
	return {
		id: r.id,
		personnelId: r.personnel_id,
		startedAt: r.started_at,
		completedAt: r.completed_at,
		status: r.status,
		steps: steps.map(transformStep)
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

	const body = await request.json();

	// Create the onboarding record
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			started_at: body.startedAt
		})
		.select()
		.single();

	if (onboardingError) throw error(500, onboardingError.message);

	// Fetch current template steps to snapshot
	const { data: templateSteps, error: templateError } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('organization_id', orgId)
		.order('sort_order');

	if (templateError) throw error(500, templateError.message);

	// Create step progress rows from template snapshot
	let steps: any[] = [];
	if (templateSteps && templateSteps.length > 0) {
		const stepRows = templateSteps.map((t: any) => ({
			onboarding_id: onboarding.id,
			step_name: t.name,
			step_type: t.step_type,
			training_type_id: t.training_type_id,
			stages: t.stages,
			sort_order: t.sort_order,
			completed: false,
			current_stage: t.step_type === 'paperwork' && t.stages?.length ? t.stages[0] : null,
			notes: []
		}));

		const { data: createdSteps, error: stepsError } = await supabase
			.from('onboarding_step_progress')
			.insert(stepRows)
			.select();

		if (stepsError) throw error(500, stepsError.message);
		steps = createdSteps ?? [];
	}

	return json(transformOnboarding(onboarding, steps));
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'onboarding');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
	const { id, ...fields } = body;

	const updateData: Record<string, unknown> = {};
	if (fields.status !== undefined) updateData.status = fields.status;
	if (fields.completedAt !== undefined) updateData.completed_at = fields.completedAt;

	const { data, error: dbError } = await supabase
		.from('personnel_onboardings')
		.update(updateData)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	// Fetch steps for response
	const { data: steps } = await supabase
		.from('onboarding_step_progress')
		.select('*')
		.eq('onboarding_id', id)
		.order('sort_order');

	return json(transformOnboarding(data, steps ?? []));
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'onboarding');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const { id } = await request.json();

	const { error: dbError } = await supabase
		.from('personnel_onboardings')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);
	return json({ success: true });
};
