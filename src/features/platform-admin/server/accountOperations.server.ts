import type { RequestEvent } from '@sveltejs/kit';
import { auditLog, createSupabasePlatformAudit } from '$lib/audit/index.server';
import {
	createIdentityPlatformAccountEmailPort,
	createIdentityPlatformSupportReader,
	getAuthConfirmRedirectTo
} from '$features/identity/index.server';
import { createOrganizationSupportReader } from '$features/organization/index.server';
import { createPersonnelSupportReader } from '$features/personnel/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createPlatformUserDirectory } from './userDirectory.server';
import { createPlatformUserIdentityCommands } from './userIdentityCommands.server';
import { checkAdminAuthEmailRateLimit } from './accountEmailRateLimit.server';

/** Used account support operations bound to current platform authority and this request origin. */
export async function createPlatformAccountOperations(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const directory = createPlatformUserDirectory({
		identity: createIdentityPlatformSupportReader(adminClient),
		organizations: createOrganizationSupportReader(adminClient),
		personnel: createPersonnelSupportReader(adminClient)
	});
	const commands = createPlatformUserIdentityCommands({
		store: createIdentityPlatformAccountEmailPort(adminClient),
		checkRateLimit: (userId, type) => checkAdminAuthEmailRateLimit(adminClient, userId, type),
		audit: { log: (entry) => auditLog(entry, requestInfo, { required: true }) },
		confirmationUrl: getAuthConfirmRedirectTo
	});
	const audit = createSupabasePlatformAudit(adminClient);
	return {
		adminUserId: actor.userId,
		listUsers: directory.listUsers,
		async getUserDetail(userId: string) {
			const result = await directory.getUserDetail(userId);
			if (result.status !== 'found') return result;
			return {
				...result,
				detail: { ...result.detail, recentActivity: await audit.listRecentByUser({ userId, limit: 10 }) }
			};
		},
		sendPasswordReset: ({ userId }: { userId: string }) =>
			commands.sendPasswordReset({ userId, inboundOrigin: event.url.origin }),
		resendInvite: ({ userId }: { userId: string }) => commands.resendInvite({ userId, inboundOrigin: event.url.origin })
	};
}
