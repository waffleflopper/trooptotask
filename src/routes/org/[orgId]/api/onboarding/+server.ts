import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';

function transformResponse(onboarding: Record<string, unknown>, steps: Record<string, unknown>[]) {
	return PersonnelOnboardingEntity.fromDb({
		...onboarding,
		onboarding_step_progress: steps
	});
}

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();

	// Create the onboarding record
	const { data: onboarding, error: onboardingError } = await supabase
		.from('personnel_onboardings')
		.insert({
			organization_id: orgId,
			personnel_id: body.personnelId,
			started_at: body.startedAt,
			template_id: body.templateId ?? null
		})
		.select()
		.single();

	if (onboardingError) throw error(500, onboardingError.message);

	// Fetch template steps to snapshot — scoped to the chosen template if provided
	let templateQuery = supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('organization_id', orgId)
		.order('sort_order');

	if (body.templateId) {
		templateQuery = templateQuery.eq('template_id', body.templateId);
	}

	const { data: templateSteps, error: templateError } = await templateQuery;

	if (templateError) throw error(500, templateError.message);

	// Create step progress rows from template snapshot, storing the source template_step_id
	let steps: Record<string, unknown>[] = [];
	if (templateSteps && templateSteps.length > 0) {
		const stepRows = templateSteps.map((t: Record<string, unknown>) => ({
			onboarding_id: onboarding.id,
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

		const { data: createdSteps, error: stepsError } = await supabase
			.from('onboarding_step_progress')
			.insert(stepRows)
			.select();

		if (stepsError) throw error(500, stepsError.message);
		steps = createdSteps ?? [];
	}

	ctx.audit.log({ action: 'onboarding_workflow.created', resourceType: 'onboarding_workflow' });
	return json(transformResponse(onboarding, steps));
};

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();
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

	ctx.audit.log({ action: 'onboarding_workflow.updated', resourceType: 'onboarding_workflow', resourceId: id });
	return json(transformResponse(data, steps ?? []));
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireEdit('onboarding');

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const { id } = await event.request.json();

	const { error: dbError } = await supabase
		.from('personnel_onboardings')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'onboarding_workflow.deleted', resourceType: 'onboarding_workflow', resourceId: id });
	return json({ success: true });
};
