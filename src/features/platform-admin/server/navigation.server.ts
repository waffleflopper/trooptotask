import type { RequestEvent } from '@sveltejs/kit';
import { admitPlatformAdministrator } from './admission.server';

export async function loadPlatformAdminNavigation(event: RequestEvent) {
	const { actor, requestInfo } = await admitPlatformAdministrator(event);
	return {
		adminUserId: actor.userId,
		adminEmail: requestInfo.userEmail ?? undefined
	};
}
