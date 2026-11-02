import type { RequestEvent } from '@sveltejs/kit';
import {
	createSupabaseErrorGroupReader,
	createSupabaseErrorGroupResolver
} from '$features/error-reporting/index.server';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformErrors } from './errors.server';

export async function createPlatformErrorOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const errors = createPlatformErrors({
		reader: createSupabaseErrorGroupReader(adminClient),
		resolver: createSupabaseErrorGroupResolver(adminClient),
		actorUserId: actor.userId,
		audit: (entry) => auditLog(entry, requestInfo, { required: true })
	});
	return { adminUserId: actor.userId, ...errors };
}
