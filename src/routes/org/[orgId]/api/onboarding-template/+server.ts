import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireEditPermission } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

function transformRow(r: any) {
	return {
		id: r.id,
		name: r.name,
		description: r.description,
		stepType: r.step_type,
		trainingTypeId: r.training_type_id,
		stages: r.stages,
		sortOrder: r.sort_order
	};
}

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

	const { data, error: dbError } = await supabase
		.from('onboarding_template_steps')
		.insert({
			organization_id: orgId,
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
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
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
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		await requireEditPermission(supabase, orgId, userId!, 'personnel');
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const { id } = await request.json();

	const { error: dbError } = await supabase
		.from('onboarding_template_steps')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);
	return json({ success: true });
};
