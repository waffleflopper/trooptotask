import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { getAuthConfirmRedirectTo } from '$lib/server/authConfirm';
import { createSupabasePlatformAudit } from '$lib/server/adapters/supabasePlatformAudit';
import { createSupabasePlatformUserDirectory } from '$lib/server/adapters/supabasePlatformUserDirectory';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'users',
	fn: async (ctx, event) => {
		const userId = event.params.userId as string;

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
			const { adminClient } = ctx;
			const userId = event.params.userId as string;

			const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
			if (authError || !authUser?.user?.email) {
				return fail(404, { error: 'User not found' });
			}

			const { error: linkError } = await adminClient.auth.resetPasswordForEmail(authUser.user.email, {
				redirectTo: getAuthConfirmRedirectTo(event.url.origin, 'recovery')
			});

			if (linkError) {
				return fail(500, { error: 'Failed to send password reset' });
			}

			ctx.audit({
				action: 'admin.user.password_reset',
				resourceType: 'user',
				resourceId: userId,
				details: { targetEmail: authUser.user.email },
				severity: 'warning'
			});

			return { success: true, message: 'Password reset email sent' };
		}
	}),

	resendInvite: adminAction({
		page: 'users',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const userId = event.params.userId as string;

			const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
			if (authError || !authUser?.user?.email) {
				return fail(404, { error: 'User not found' });
			}

			const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(authUser.user.email, {
				redirectTo: getAuthConfirmRedirectTo(event.url.origin, 'invite')
			});

			if (inviteError) {
				return fail(500, { error: 'Failed to resend invite' });
			}

			ctx.audit({
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: userId,
				details: { targetEmail: authUser.user.email },
				severity: 'info'
			});

			return { success: true, message: 'Invite email resent' };
		}
	})
};
