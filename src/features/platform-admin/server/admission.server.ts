import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getAdminClient } from '$lib/server/supabase';
import { getRequestInfo } from '$lib/audit/index.server';
import type { PlatformSupportAdminRole } from '../organizationSupportTypes';

/** Private delivery admission: current platform authority comes from the verified hook actor. */
export async function admitPlatformAdministrator(
	event: RequestEvent,
	allowedRoles: readonly PlatformSupportAdminRole[],
	denialMessage = 'Access denied. Platform admin access is required.'
) {
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
	const role = authority.data?.role as PlatformSupportAdminRole | undefined;
	if (!role || !allowedRoles.includes(role)) error(403, denialMessage);
	return {
		actor,
		role,
		adminClient,
		requestInfo: {
			...getRequestInfo(event),
			userId: actor.userId,
			userEmail: event.locals.user?.id === actor.userId ? (event.locals.user.email ?? null) : null
		}
	};
}
