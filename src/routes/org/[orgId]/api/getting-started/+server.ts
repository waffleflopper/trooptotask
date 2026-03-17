import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUUID } from '$lib/server/validation';

// POST: dismiss the getting started checklist
export const POST: RequestHandler = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	if (!userId) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!validateUUID(params.orgId)) {
		return new Response(JSON.stringify({ error: 'Invalid org ID' }), { status: 400 });
	}

	const { error } = await supabase.from('getting_started_progress').upsert(
		{
			organization_id: params.orgId,
			user_id: userId,
			dismissed_at: new Date().toISOString()
		},
		{ onConflict: 'organization_id,user_id' }
	);

	if (error) {
		return new Response(JSON.stringify({ error: 'Failed to dismiss' }), { status: 500 });
	}

	return json({ success: true });
};

// DELETE: un-dismiss (show checklist again)
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const supabase = locals.supabase;
	const userId = locals.user?.id;

	if (!userId) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	if (!validateUUID(params.orgId)) {
		return new Response(JSON.stringify({ error: 'Invalid org ID' }), { status: 400 });
	}

	const { error } = await supabase
		.from('getting_started_progress')
		.update({ dismissed_at: null })
		.eq('organization_id', params.orgId)
		.eq('user_id', userId);

	if (error) {
		return new Response(JSON.stringify({ error: 'Failed to un-dismiss' }), { status: 500 });
	}

	return json({ success: true });
};
