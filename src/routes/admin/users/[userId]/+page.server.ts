import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createPlatformAccountOperations } from '$features/platform-admin/index.server';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformAccountOperations(event);
	const userId = event.params.userId as string;
	if (!validateUUID(userId)) error(400, 'Invalid user ID');

	const userDetail = await operations.getUserDetail(userId);
	if (userDetail.status === 'not_found') error(404, 'User not found');
	if (userDetail.status === 'auth_error') error(500, 'Failed to load user identity');

	const isSelf = userId.toLowerCase() === operations.adminUserId.toLowerCase();
	return {
		...userDetail.detail,
		isSelf,
		canSuspend: !isSelf,
		suspendDisabledReason: isSelf ? 'You cannot suspend your own account.' : null
	};
};

export const actions: Actions = {
	resetPassword: async (event) => {
		const operations = await createPlatformAccountOperations(event);
		const userId = event.params.userId as string;
		if (!validateUUID(userId)) return fail(400, { error: 'Invalid user ID' });

		const result = await operations.sendPasswordReset({ userId });
		if (result.status === 'not_found') return fail(404, { error: 'User not found' });
		if (result.status === 'provider_error') return fail(500, { error: 'Failed to send password reset' });
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
		if (result.status === 'rate_limited') return fail(429, { error: result.message });
		return { success: true, message: result.message };
	}
};
