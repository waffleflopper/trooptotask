import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPermissionContext } from '$lib/server/permissionContext';
import { getApiContext } from '$lib/server/supabase';
import { checkReadOnly } from '$lib/server/read-only-guard';

function transformTemplate(r: Record<string, unknown>) {
	return {
		id: r.id,
		orgId: r.organization_id,
		name: r.name,
		description: r.description,
		createdAt: r.created_at
	};
}

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const { supabase } = getApiContext(locals, cookies, orgId);

	const { data, error: dbError } = await supabase
		.from('onboarding_templates')
		.select('*')
		.eq('organization_id', orgId)
		.order('name');

	if (dbError) throw error(500, dbError.message);
	return json((data ?? []).map(transformTemplate));
};

export const POST: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireFullEditor();
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();

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
};

export const PUT: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireFullEditor();
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const body = await request.json();
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
};

export const DELETE: RequestHandler = async ({ params, request, locals, cookies }) => {
	const { orgId } = params;
	const { supabase, userId, isSandbox } = getApiContext(locals, cookies, orgId);

	if (!isSandbox) {
		const ctx = await createPermissionContext(supabase, userId!, orgId);
		ctx.requireFullEditor();
	}

	const blocked = await checkReadOnly(supabase, orgId);
	if (blocked) return blocked;

	const { id } = await request.json();

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
};
