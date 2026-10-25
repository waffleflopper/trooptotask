import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformWhatsNew } from './whatsNew.server';
import { listPublishedWhatsNew } from './whatsNewContent.server';
import { createSupabaseWhatsNewStore } from './whatsNewProvider.server';

export async function createPlatformWhatsNewOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	return createPlatformWhatsNew({
		store: createSupabaseWhatsNewStore(adminClient),
		actorUserId: actor.userId,
		audit: (entry) => auditLog(entry, requestInfo, { required: true })
	});
}

/** What a signed-in account sees: published entries only, through its own request client. */
export function readPublishedWhatsNew(event: Pick<RequestEvent, 'locals'>, limit: number) {
	return listPublishedWhatsNew(event.locals.supabase, limit);
}
