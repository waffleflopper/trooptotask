import type { ServerLoadEvent } from '@sveltejs/kit';
import { admitPlatformAdministrator } from './admission.server';
import { countOpenInboxItems, createInboxSources } from './inboxSources.server';

export async function loadPlatformAdminNavigation(event: ServerLoadEvent) {
	event.depends('admin:inbox');
	const { actor, requestInfo, adminClient } = await admitPlatformAdministrator(event);
	return {
		adminUserId: actor.userId,
		adminEmail: requestInfo.userEmail ?? undefined,
		/** Streams, so the shell never waits on the count. */
		inboxOpenCount: countOpenInboxItems(createInboxSources(adminClient))
	};
}
