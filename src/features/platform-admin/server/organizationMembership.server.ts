import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/audit/index.server';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import {
	createOrganizationPlatformMembershipAdministration,
	createSupabaseOrganizationPlatformMembershipPort
} from '$features/organization/index.server';

/** Bind the hook-verified administrator and request assurance at the server delivery edge. */
export async function createPlatformOrganizationMembershipCommands(event: RequestEvent) {
	const actor = event.locals.actor;
	if (!actor) redirect(303, '/auth/login');
	const adminClient = getAdminClient();
	const authority = await adminClient
		.from('platform_admins')
		.select('role')
		.eq('user_id', actor.userId)
		.eq('is_active', true)
		.maybeSingle()
		.then(
			(result) => result,
			() => ({ data: null, error: true })
		);
	if (authority.error || (authority.data && !['super_admin', 'support', 'billing'].includes(authority.data.role)))
		error(503, 'Unable to verify platform administration access');
	if (authority.data?.role !== 'super_admin') error(403, 'Super-admin access is required');
	const requestInfo = {
		...getRequestInfo(event),
		userId: actor.userId,
		userEmail: event.locals.user?.id === actor.userId ? (event.locals.user.email ?? null) : null
	};
	const administration = createOrganizationPlatformMembershipAdministration({
		actor: { userId: actor.userId, role: 'super_admin' },
		port: createSupabaseOrganizationPlatformMembershipPort(adminClient),
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			supabase: event.locals.supabase,
			session: event.locals.session,
			authenticatedUserId: actor.userId
		}),
		audit: { log: (entry) => auditLog(entry, requestInfo) }
	});
	return { makeAdmin: administration.makeAdmin, transferOwnership: administration.transferOwnership };
}
