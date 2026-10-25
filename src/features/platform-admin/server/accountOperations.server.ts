import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import { createIdentityPlatformAccountEmailPort, getAuthConfirmRedirectTo } from '$features/identity/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformUserIdentityCommands } from './userIdentityCommands.server';
import { checkAdminAuthEmailRateLimit } from './accountEmailRateLimit.server';

/** Used account support operations bound to current platform authority and this request origin. */
export async function createPlatformAccountOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const commands = createPlatformUserIdentityCommands({
		store: createIdentityPlatformAccountEmailPort(adminClient),
		checkRateLimit: (userId, type) => checkAdminAuthEmailRateLimit(adminClient, userId, type),
		audit: { log: (entry) => auditLog(entry, requestInfo, { required: true }) },
		confirmationUrl: getAuthConfirmRedirectTo
	});
	return {
		adminUserId: actor.userId,
		sendPasswordReset: ({ userId }: { userId: string }) =>
			commands.sendPasswordReset({ userId, inboundOrigin: event.url.origin })
	};
}
