import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	createPlatformPeopleOperations,
	createPlatformAccountOperations,
	createPlatformSuspensionOperations
} from '$features/platform-admin/index.server';
import { RequestFailure } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformPeopleOperations(event);
	const userId = event.params.userId;
	if (!validateUUID(userId)) error(400, 'Invalid account ID');
	const result = await operations.account(userId);
	if (result.status === 'not_found') error(404, 'Account not found');
	if (result.status === 'auth_error') error(503, 'Unable to load account');
	const isSelf = userId.toLowerCase() === operations.adminUserId.toLowerCase();
	return {
		...result,
		mfaEnabled: result.person.mfaEnabled ?? false,
		breadcrumbLabel: result.person.email ?? 'Person',
		isSelf,
		canSuspend: !isSelf,
		suspendDisabledReason: isSelf ? 'You cannot suspend your own account.' : null,
		accountFacts: operations.accountFacts(userId),
		organizations: operations.organizations(userId),
		accessHistory: operations.accessHistory(result.person.email ?? ''),
		recentActivity: operations.recentActivity(userId)
	};
};

export const actions: Actions = {
	resetPassword: async (event) => {
		const operations = await createPlatformAccountOperations(event);
		const userId = event.params.userId;
		if (!validateUUID(userId)) return fail(400, { error: 'Invalid account ID' });
		const result = await operations.sendPasswordReset({ userId });
		if (result.status === 'sent') return { success: true, message: result.message };
		if (result.status === 'email_sent_audit_failed')
			return fail(500, { status: result.status, emailSent: true, error: result.message });
		if (result.status === 'rate_limited') return fail(429, { error: result.message });
		return fail(result.status === 'not_found' ? 404 : 502, { error: 'Unable to send password reset' });
	},
	suspend: async (event) => {
		const operations = await createPlatformSuspensionOperations(event);
		if (!validateUUID(event.params.userId)) return fail(400, { error: 'Invalid account ID' });
		const form = await event.request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason || reason.length > 1000) return fail(400, { error: 'Enter a reason of up to 1000 characters.' });
		const action = form.get('action') === 'unsuspend' ? 'unsuspend' : 'suspend';
		try {
			const result = await operations.updateSuspension({ type: 'user', targetId: event.params.userId, action, reason });
			if (result.status === 'invalid_input') return fail(400, { error: result.message });
			return { success: true, action };
		} catch (cause) {
			if (cause instanceof RequestFailure)
				return fail(cause.status, {
					error: cause.message,
					reason: cause.reason,
					requiresStepUp: cause.requiresStepUp,
					stepUpPath: cause.stepUpPath
				});
			return fail(500, { error: 'Could not confirm the suspension change. Reload before trying again.' });
		}
	}
};
