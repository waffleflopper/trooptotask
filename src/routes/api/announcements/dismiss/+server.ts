import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateUUID } from '$lib/server/validation';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const { announcementId } = await request.json();
	if (!announcementId || !validateUUID(announcementId)) {
		throw error(400, 'Invalid announcement ID');
	}

	await supabase.from('announcement_dismissals').upsert({ announcement_id: announcementId, user_id: user.id });

	return json({ success: true });
};
