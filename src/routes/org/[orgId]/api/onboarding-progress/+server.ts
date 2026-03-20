import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

export const PUT = apiRoute(
	{ permission: { edit: 'onboarding' }, audit: 'onboarding_progress' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();
		const { id, ...fields } = body;

		// Verify step belongs to an onboarding in this org
		const { data: stepCheck } = await supabase
			.from('onboarding_step_progress')
			.select('id, onboarding_id, personnel_onboardings!inner(organization_id)')
			.eq('id', id)
			.single();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase joined query result has dynamic nested shape
		if (!stepCheck || (stepCheck as any).personnel_onboardings?.organization_id !== orgId) {
			throw error(404, 'Step not found');
		}

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
			notes: Array.isArray(data.notes) ? data.notes : [],
			templateStepId: data.template_step_id ?? null
		});
	}
);

export const DELETE = apiRoute(
	{ permission: { edit: 'onboarding' }, audit: 'onboarding_progress' },
	async ({ supabase, orgId }, event) => {
		const { id } = await event.request.json();

		// Verify step belongs to an onboarding in this org
		const { data: stepCheck } = await supabase
			.from('onboarding_step_progress')
			.select('id, completed, onboarding_id, personnel_onboardings!inner(organization_id)')
			.eq('id', id)
			.single();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase joined query result has dynamic nested shape
		if (!stepCheck || (stepCheck as any).personnel_onboardings?.organization_id !== orgId) {
			throw error(404, 'Step not found');
		}

		// Only allow removing incomplete deprecated steps
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase joined query result has dynamic nested shape
		if ((stepCheck as any).completed) {
			throw error(409, 'Cannot remove a completed step.');
		}

		const { error: dbError } = await supabase.from('onboarding_step_progress').delete().eq('id', id);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}
);
