import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import type { ActivityQuery } from '../activityQuery';
import { admitPlatformAdministrator } from './admission.server';
import { listPlatformActivity } from './activity.server';

export async function createPlatformActivityOperations(event: RequestEvent) {
	const { adminClient, actor } = await admitPlatformAdministrator(event);
	const audit = createSupabasePlatformAudit(adminClient);
	return {
		list: (query: ActivityQuery, timeZone: string) => listPlatformActivity(audit, query, timeZone, actor.userId)
	};
}
