import { json, error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { buildContext } from '$lib/server/adapters/httpAdapter';
import { getApiContext } from '$lib/server/supabase';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';

export const POST = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireFullEditor();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();

	const insertData = OnboardingTemplateStepEntity.toDbInsert(body, orgId);

	const { data, error: dbError } = await supabase
		.from('onboarding_template_steps')
		.insert(insertData)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'onboarding_template.created', resourceType: 'onboarding_template' });
	return json(OnboardingTemplateStepEntity.fromDb(data as Record<string, unknown>));
};

export const PUT = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireFullEditor();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const body = await event.request.json();
	const { id, ...fields } = body;

	const updates = OnboardingTemplateStepEntity.toDbUpdate({ id, ...fields });

	const { data, error: dbError } = await supabase
		.from('onboarding_template_steps')
		.update(updates)
		.eq('id', id)
		.eq('organization_id', orgId)
		.select()
		.single();

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'onboarding_template.updated', resourceType: 'onboarding_template', resourceId: id });
	return json(OnboardingTemplateStepEntity.fromDb(data as Record<string, unknown>));
};

export const DELETE = async (event: RequestEvent) => {
	const ctx = await buildContext(event);
	const orgId = event.params.orgId as string;
	const { supabase } = getApiContext(event.locals, event.cookies, orgId);

	ctx.auth.requireFullEditor();

	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) throw error(403, 'Organization is in read-only mode');

	const { id } = await event.request.json();

	const { error: dbError } = await supabase
		.from('onboarding_template_steps')
		.delete()
		.eq('id', id)
		.eq('organization_id', orgId);

	if (dbError) throw error(500, dbError.message);

	ctx.audit.log({ action: 'onboarding_template.deleted', resourceType: 'onboarding_template', resourceId: id });
	return json({ success: true });
};
