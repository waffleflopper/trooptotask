import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const body = await request.json();
	const { id, ...fields } = body;

	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (fields.completed !== undefined) updateData.completed = fields.completed;
	if (fields.currentStage !== undefined) updateData.current_stage = fields.currentStage;
	if (fields.notes !== undefined) updateData.notes = fields.notes;

	const { data, error: dbError } = await supabase
		.from('onboarding_step_progress')
		.update(updateData)
		.eq('id', id)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	return json({
		id: data.id,
		onboardingId: data.onboarding_id,
		stepName: data.step_name,
		stepType: data.step_type,
		trainingTypeId: data.training_type_id,
		stages: data.stages,
		sortOrder: data.sort_order,
		completed: data.completed,
		currentStage: data.current_stage,
		notes: data.notes ?? []
	});
};
