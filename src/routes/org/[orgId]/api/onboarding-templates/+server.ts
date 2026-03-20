import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';

function transformTemplate(r: Record<string, unknown>) {
	return {
		id: r.id,
		orgId: r.organization_id,
		name: r.name,
		description: r.description,
		createdAt: r.created_at
	};
}

export const GET = apiRoute({ permission: { authenticated: true }, readOnly: false }, async ({ supabase, orgId }) => {
	const { data, error: dbError } = await supabase
		.from('onboarding_templates')
		.select('*')
		.eq('organization_id', orgId)
		.order('name');

	if (dbError) throw error(500, dbError.message);
	return json((data ?? []).map(transformTemplate));
});

export const POST = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const body = await event.request.json();

		const { data, error: dbError } = await supabase
			.from('onboarding_templates')
			.insert({
				organization_id: orgId,
				name: body.name,
				description: body.description ?? null
			})
			.select()
			.single();

		if (dbError) {
			if (dbError.code === '23505') {
				throw error(409, 'A template with that name already exists.');
			}
			throw error(500, dbError.message);
		}

		return json(transformTemplate(data));
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

		const { data, error: dbError } = await supabase
			.from('onboarding_templates')
			.update(updateData)
			.eq('id', id)
			.eq('organization_id', orgId)
			.select()
			.single();

		if (dbError) {
			if (dbError.code === '23505') {
				throw error(409, 'A template with that name already exists.');
			}
			throw error(500, dbError.message);
		}

		return json(transformTemplate(data));
	}
);

export const DELETE = apiRoute(
	{ permission: { fullEditor: true }, audit: 'onboarding_template' },
	async ({ supabase, orgId }, event) => {
		const { id } = await event.request.json();

		// Block only if active (in_progress) onboardings reference this template
		const { count, error: countError } = await supabase
			.from('personnel_onboardings')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', orgId)
			.eq('template_id', id)
			.eq('status', 'in_progress');

		if (countError) throw error(500, countError.message);

		if ((count ?? 0) > 0) {
			throw error(
				409,
				`Cannot delete — ${count} active onboarding${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} using this template.`
			);
		}

		// Prevent deleting the last template
		const { count: templateCount, error: templateCountError } = await supabase
			.from('onboarding_templates')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', orgId);

		if (templateCountError) throw error(500, templateCountError.message);

		if ((templateCount ?? 0) <= 1) {
			throw error(409, 'Cannot delete the last template. Create another template first.');
		}

		const { error: dbError } = await supabase
			.from('onboarding_templates')
			.delete()
			.eq('id', id)
			.eq('organization_id', orgId);

		if (dbError) throw error(500, dbError.message);
		return json({ success: true });
	}
);
