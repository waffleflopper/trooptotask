import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

function transformRow(r: Record<string, unknown>) {
	return {
		id: r.id,
		templateId: r.template_id,
		name: r.name,
		description: r.description,
		stepType: r.step_type,
		trainingTypeId: r.training_type_id,
		stages: r.stages,
		sortOrder: r.sort_order
	};
}

export const POST = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();

		const { data, error: dbError } = await supabase
			.from('onboarding_template_steps')
			.insert({
				organization_id: orgId,
				template_id: body.templateId,
				name: body.name,
				description: body.description ?? null,
				step_type: body.stepType,
				training_type_id: body.trainingTypeId ?? null,
				stages: body.stages ?? null,
				sort_order: body.sortOrder ?? 0
			})
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);
		return json(transformRow(data));
	}
);

export const PUT = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();
		const { id, ...fields } = body;

		const updateData: Record<string, unknown> = {};
		if (fields.name !== undefined) updateData.name = fields.name;
		if (fields.description !== undefined) updateData.description = fields.description;
		if (fields.stepType !== undefined) updateData.step_type = fields.stepType;
		if (fields.trainingTypeId !== undefined) updateData.training_type_id = fields.trainingTypeId;
		if (fields.stages !== undefined) updateData.stages = fields.stages;
		if (fields.sortOrder !== undefined) updateData.sort_order = fields.sortOrder;

		const { data, error: dbError } = await supabase
			.from('onboarding_template_steps')
			.update(updateData)
			.eq('id', id)
			.eq('organization_id', orgId)
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);
		return json(transformRow(data));
	}
);

export const DELETE = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const { id } = await event.request.json();

		const { error: dbError } = await supabase
			.from('onboarding_template_steps')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}
);
