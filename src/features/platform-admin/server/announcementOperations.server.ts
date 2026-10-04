import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformAnnouncements } from './announcements.server';
import { createSupabasePlatformAnnouncementsStore } from './announcementProvider.server';
import { PLATFORM_ADMIN_PAGE_ROLES } from './navigation.server';

export async function createPlatformAnnouncementOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(
		event,
		PLATFORM_ADMIN_PAGE_ROLES.announcements
	);
	return createPlatformAnnouncements({
		store: createSupabasePlatformAnnouncementsStore(adminClient),
		actorUserId: actor.userId,
		audit: (entry) => auditLog(entry, requestInfo)
	});
}
