import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';

export const POST = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();

		const insertData = OnboardingTemplateStepEntity.toDbInsert(body, orgId);

		const { data, error: dbError } = await supabase
			.from('onboarding_template_steps')
			.insert(insertData)
			.select()
			.single();

		if (dbError) throw error(500, dbError.message);
		return json(OnboardingTemplateStepEntity.fromDb(data as Record<string, unknown>));
	}
);

export const PUT = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
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
		return json(OnboardingTemplateStepEntity.fromDb(data as Record<string, unknown>));
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
