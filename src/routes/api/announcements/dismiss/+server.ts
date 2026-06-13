import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseAnnouncementDismissalsFromLocals } from '$lib/server/adapters/supabaseAnnouncementDismissals';
import { validateUUID } from '$lib/server/validation';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const { announcementId } = await request.json();
	if (!announcementId || !validateUUID(announcementId)) {
		throw error(400, 'Invalid announcement ID');
	}

	await createSupabaseAnnouncementDismissalsFromLocals(locals).dismiss(user.id, announcementId);

	return json({ success: true });
};
