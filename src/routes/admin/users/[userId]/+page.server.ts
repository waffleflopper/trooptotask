import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAudit } from '$lib/server/adapters/supabasePlatformAudit';
import { createSupabasePlatformUserIdentityCommands } from '$lib/server/adapters/supabasePlatformUserIdentityCommands';
import { createSupabasePlatformUserDirectory } from '$lib/server/adapters/supabasePlatformUserDirectory';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'users',
	fn: async (ctx, event) => {
		const userId = event.params.userId as string;
		if (!validateUUID(userId)) throw error(400, 'Invalid user ID');

		const userDetail = await createSupabasePlatformUserDirectory(ctx).getUserDetail(userId);
		if (userDetail.status === 'not_found') throw error(404, 'User not found');
		if (userDetail.status === 'auth_error') throw error(500, 'Failed to load user identity');

		const recentActivity = await createSupabasePlatformAudit(ctx).listRecentByUser({ userId, limit: 10 });

		return {
			...userDetail.detail,
			recentActivity
		};
	}
});

export const actions: Actions = {
	resetPassword: adminAction({
		page: 'users',
		fn: async (ctx, event) => {
			const userId = event.params.userId as string;
			if (!validateUUID(userId)) return fail(400, { error: 'Invalid user ID' });

			const result = await createSupabasePlatformUserIdentityCommands(ctx).sendPasswordReset({
				userId,
				inboundOrigin: event.url.origin
			});

			if (result.status === 'not_found') return fail(404, { error: 'User not found' });
			if (result.status === 'provider_error') return fail(500, { error: 'Failed to send password reset' });
			return { success: true, message: result.message };
		}
	}),

	resendInvite: adminAction({
		page: 'users',
		fn: async (ctx, event) => {
			const userId = event.params.userId as string;
			if (!validateUUID(userId)) return fail(400, { error: 'Invalid user ID' });

			const result = await createSupabasePlatformUserIdentityCommands(ctx).resendInvite({
				userId,
				inboundOrigin: event.url.origin
			});

			if (result.status === 'not_found') return fail(404, { error: 'User not found' });
			if (result.status === 'provider_error') return fail(500, { error: 'Failed to resend invite' });
			return { success: true, message: result.message };
		}
	})
};
