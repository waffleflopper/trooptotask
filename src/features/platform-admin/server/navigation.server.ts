import type { RequestEvent } from '@sveltejs/kit';
import { admitPlatformAdministrator } from './admission.server';

const PLATFORM_ADMIN_PAGES = [
	'dashboard',
	'users',
	'organizations',
	'access-requests',
	'feedback',
	'audit',
	'announcements'
] as const;
export type PlatformAdminPage = (typeof PLATFORM_ADMIN_PAGES)[number];

export async function loadPlatformAdminNavigation(event: RequestEvent) {
	const { actor, requestInfo } = await admitPlatformAdministrator(event);
	return {
		adminUserId: actor.userId,
		adminEmail: requestInfo.userEmail ?? undefined,
		accessiblePages: [...PLATFORM_ADMIN_PAGES]
	};
}
