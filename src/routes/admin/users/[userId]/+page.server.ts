import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createPlatformAccountOperations } from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const load = (async (
	event
): Promise<{
	user: {
		id: string;
		email: string;
		createdAt: string;
		lastSignInAt: string | null;
		emailConfirmedAt: string | null;
		emailConfirmationStatus: 'confirmed' | 'pending';
	};
	organizations: Array<{ id: string | null; name: string; role: string; personnelCount: number }>;
	suspension: { suspendedAt: string; suspendedBy: string; reason: string | null } | null;
	isSuspended: boolean;
	recentActivity: import('$lib/audit/contracts').PlatformAuditUserActivity[];
	isSelf: boolean;
	canSuspend: boolean;
	suspendDisabledReason: string | null;
}> => {
	await createPlatformAccountOperations(event);
	if (!validateUUID(event.params.userId)) error(400, 'Invalid user ID');
	redirect(308, `/admin/people/${event.params.userId}${event.url.search}`);
}) satisfies PageServerLoad;

export const actions: Actions = {
	resetPassword: async (event) => {
		const operations = await createPlatformAccountOperations(event);
		const userId = event.params.userId as string;
		if (!validateUUID(userId)) return fail(400, { error: 'Invalid user ID' });

		const result = await operations.sendPasswordReset({ userId });
		if (result.status === 'not_found') return fail(404, { error: 'User not found' });
		if (result.status === 'provider_error') return fail(500, { error: 'Failed to send password reset' });
		if (result.status === 'email_sent_audit_failed')
			return fail(500, { status: result.status, emailSent: true, error: result.message });
		if (result.status === 'rate_limited') return fail(429, { error: result.message });
		return { success: true, message: result.message };
	},

	resendInvite: async (event) => {
		const operations = await createPlatformAccountOperations(event);
		const userId = event.params.userId as string;
		if (!validateUUID(userId)) return fail(400, { error: 'Invalid user ID' });

		const result = await operations.resendInvite({ userId });
		if (result.status === 'not_found') return fail(404, { error: 'User not found' });
		if (result.status === 'provider_error') return fail(500, { error: 'Failed to resend invite' });
		if (result.status === 'email_sent_audit_failed')
			return fail(500, { status: result.status, emailSent: true, error: result.message });
		if (result.status === 'rate_limited') return fail(429, { error: result.message });
		return { success: true, message: result.message };
	}
};
