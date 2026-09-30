import { json, error } from '@sveltejs/kit';
import { rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import type { RequestHandler } from './$types';
import {
	createSupabaseAccountAnnouncementDismissals,
	dismissAccountAnnouncement
} from '$features/notifications/index.server';

export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = locals.actor;
	if (!actor) throw error(401, 'Not authenticated');
	const { announcementId } = await request.json();
	try {
		await dismissAccountAnnouncement(
			{ userId: actor.userId, dismissals: createSupabaseAccountAnnouncementDismissals(locals.supabase, actor.userId) },
			announcementId
		);
	} catch (cause) {
		rethrowOrWrap(cause);
	}
	return json({ success: true });
};
