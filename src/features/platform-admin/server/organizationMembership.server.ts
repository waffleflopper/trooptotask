import type { RequestEvent } from '@sveltejs/kit';
import { auditLog } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import {
	createOrganizationPlatformMembershipAdministration,
	createSupabaseOrganizationPlatformMembershipPort
} from '$features/organization/index.server';

/** Bind the hook-verified administrator and request assurance at the server delivery edge. */
export async function createPlatformOrganizationMembershipCommands(event: RequestEvent) {
	const { actor, adminClient, requestInfo } = await admitPlatformAdministrator(event);
	const administration = createOrganizationPlatformMembershipAdministration({
		actor: { userId: actor.userId },
		port: createSupabaseOrganizationPlatformMembershipPort(adminClient),
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			supabase: event.locals.supabase,
			session: event.locals.session,
			authenticatedUserId: actor.userId
		}),
		audit: { log: (entry) => auditLog(entry, requestInfo, { required: true }) }
	});
	return { transferOwnership: administration.transferOwnership };
}
