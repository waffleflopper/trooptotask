import { json, error } from '@sveltejs/kit';
import {
	createRequestAccountAnnouncementDismissals,
	readJsonBody,
	rethrowOrWrap
} from '$lib/server/adapters/httpAdapter';
import type { RequestHandler } from './$types';
import { dismissAccountAnnouncement } from '$features/notifications/index.server';

export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = locals.actor;
	if (!actor) throw error(401, 'Not authenticated');
	const { announcementId } = await readJsonBody({ request }).catch(rethrowOrWrap);
	try {
		await dismissAccountAnnouncement(
			{ userId: actor.userId, dismissals: createRequestAccountAnnouncementDismissals(locals, actor.userId) },
			announcementId
		);
	} catch (cause) {
		rethrowOrWrap(cause);
	}
	return json({ success: true });
};
