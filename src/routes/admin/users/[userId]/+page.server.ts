import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { getAuthConfirmRedirectTo } from '$lib/server/authConfirm';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { fetchPersonnelCountsByOrganization } from '../../adminOrganizationMetrics.server';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'users',
	fn: async (ctx, event) => {
		const { adminClient } = ctx;
		const userId = event.params.userId as string;

		const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
		if (authError || !authUser?.user) {
			throw error(404, 'User not found');
		}

		const [orgsResult, suspensionResult, auditResult] = await Promise.all([
			selectAllSupabaseRows<Record<string, unknown>>(
				(from, to) =>
					adminClient
						.from('organization_memberships')
						.select('organization_id, role, organizations(id, name, tier, gift_tier)')
						.eq('user_id', userId)
						.range(from, to) as unknown as Promise<{
						data: Record<string, unknown>[] | null;
						error: unknown;
					}>
			),
			adminClient
				.from('user_suspensions')
				.select('user_id, suspended_at, suspended_by, reason')
				.eq('user_id', userId)
				.maybeSingle(),
			adminClient
				.from('audit_logs')
				.select('id, action, resource_type, resource_id, org_id, timestamp, details, severity')
				.eq('user_id', userId)
				.order('timestamp', { ascending: false })
				.limit(10)
		]);

		const orgIds = (orgsResult.data ?? [])
			.map((o: Record<string, unknown>) => (o.organizations as Record<string, unknown> | null)?.id)
			.filter((id): id is string => typeof id === 'string');
		const personnelCounts = await fetchPersonnelCountsByOrganization(adminClient, orgIds);

		const organizations = (orgsResult.data ?? []).map((o: Record<string, unknown>) => {
			const org = o.organizations as Record<string, unknown> | null;
			return {
				id: org?.id ?? null,
				name: (org?.name as string) ?? 'Unknown',
				role: o.role as string,
				subscriptionTier: (org?.gift_tier ?? org?.tier ?? 'free') as string,
				personnelCount: typeof org?.id === 'string' ? (personnelCounts.get(org.id) ?? 0) : 0
			};
		});

		const suspension = suspensionResult.data
			? {
					suspendedAt: suspensionResult.data.suspended_at as string,
					suspendedBy: suspensionResult.data.suspended_by as string,
					reason: suspensionResult.data.reason as string | null
				}
			: null;

		const recentActivity = (auditResult.data ?? []).map((a: Record<string, unknown>) => ({
			id: a.id as string,
			action: a.action as string,
			resourceType: a.resource_type as string,
			resourceId: a.resource_id as string | null,
			orgId: a.org_id as string | null,
			timestamp: a.timestamp as string,
			severity: a.severity as string
		}));

		return {
			user: {
				id: userId,
				email: authUser.user.email || 'No email',
				createdAt: authUser.user.created_at,
				lastSignInAt: authUser.user.last_sign_in_at ?? null
			},
			organizations,
			suspension,
			recentActivity,
			isSuspended: !!suspension
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
