import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getAdminClient } from '$lib/server/supabase';
import { getRequestInfo } from '$lib/audit/index.server';
import { readIdentityMfaStatus } from '$features/identity/index.server';

export async function admitPlatformAdministrator(event: RequestEvent) {
	// Pending MFA withholds the hook actor; the aal2 check below still gates every platform read and write.
	const actor =
		event.locals.actor ??
		(event.locals.mfaPending && !event.locals.authFlow && event.locals.user ? { userId: event.locals.user.id } : null);
	if (!actor) error(403, 'Platform operator access is required.');
	const adminClient = getAdminClient();
	const authority = await adminClient
		.from('platform_operators')
		.select('user_id')
		.eq('user_id', actor.userId)
		.maybeSingle()
		.then(
			(result) => result,
			() => ({ data: null, error: true })
		);
	if (authority.error) error(503, 'Unable to verify platform operator access');
	if (!authority.data) error(403, 'Platform operator access is required.');
	const assurance = await readIdentityMfaStatus({ supabase: event.locals.supabase });
	if (assurance.status !== 'ready') error(503, 'Unable to verify multi-factor authentication');
	if (assurance.assurance.currentLevel !== 'aal2') {
		const destination = assurance.assurance.nextLevel === 'aal2' ? '/auth/mfa-verify' : '/auth/mfa-setup';
		if (event.url.pathname.startsWith('/admin/api/')) {
			const failure = {
				message: 'Complete multi-factor authentication before using platform administration.',
				requiresStepUp: true,
				stepUpPath: destination
			};
			error(403, failure);
		}
		redirect(303, `${destination}?${new URLSearchParams({ next: event.url.pathname + event.url.search })}`);
	}
	return {
		actor,
		adminClient,
		requestInfo: {
			...getRequestInfo(event),
			userId: actor.userId,
			userEmail: event.locals.user?.id === actor.userId ? (event.locals.user.email ?? null) : null
		}
	};
}
