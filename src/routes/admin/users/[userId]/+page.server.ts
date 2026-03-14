import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAdminRole, canAccessPage } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';

export const load: PageServerLoad = async ({ params, locals }) => {
	const supabase = locals.supabase;
	const adminClient = getAdminClient();
	const { userId } = params;

	// Get user email from auth
	const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
	if (authError || !authUser?.user) {
		throw error(404, 'User not found');
	}

	// Run parallel queries
	const [orgsResult, suspensionResult, auditResult] = await Promise.all([
		adminClient
			.from('organization_memberships')
			.select('organization_id, role, organizations(id, name, tier, gift_tier)')
			.eq('user_id', userId),
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

	// Get personnel counts per org
	const orgIds = (orgsResult.data ?? []).map((o: any) => o.organizations?.id).filter(Boolean);
	let personnelCountMap: Record<string, number> = {};
	if (orgIds.length > 0) {
		const { data: personnelRows } = await adminClient
			.from('personnel')
			.select('organization_id')
			.in('organization_id', orgIds)
			.is('archived_at', null);
		(personnelRows ?? []).forEach((p: { organization_id: string }) => {
			personnelCountMap[p.organization_id] = (personnelCountMap[p.organization_id] || 0) + 1;
		});
	}

	const organizations = (orgsResult.data ?? []).map((o: any) => ({
		id: o.organizations?.id ?? null,
		name: o.organizations?.name ?? 'Unknown',
		role: o.role as string,
		subscriptionTier: (o.organizations?.gift_tier ?? o.organizations?.tier ?? 'free') as string,
		personnelCount: personnelCountMap[o.organizations?.id] ?? 0
	}));

	const suspension = suspensionResult.data
		? {
				suspendedAt: suspensionResult.data.suspended_at as string,
				suspendedBy: suspensionResult.data.suspended_by as string,
				reason: suspensionResult.data.reason as string | null
			}
		: null;

	const recentActivity = (auditResult.data ?? []).map((a: any) => ({
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
};

export const actions: Actions = {
	resetPassword: async (event) => {
		const { params, locals } = event;
		const supabase = locals.supabase;
		const adminClient = getAdminClient();
		const { userId } = params;

		// Verify caller is platform admin
		const sessionUser = locals.user;
		if (!sessionUser) return fail(401, { error: 'Unauthorized' });

		const role = await getAdminRole(supabase, sessionUser.id);
		if (!role || !canAccessPage(role, 'users')) {
			return fail(403, { error: 'Forbidden' });
		}

		// Get user email
		const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
		if (authError || !authUser?.user?.email) {
			return fail(404, { error: 'User not found' });
		}

		const { error: linkError } = await adminClient.auth.admin.generateLink({
			type: 'recovery',
			email: authUser.user.email
		});

		if (linkError) {
			return fail(500, { error: 'Failed to send password reset' });
		}

		await auditLog(
			{
				action: 'admin.user.password_reset',
				resourceType: 'user',
				resourceId: userId,
				details: { targetEmail: authUser.user.email },
				severity: 'warning'
			},
			getRequestInfo(event)
		);

		return { success: true, message: 'Password reset email sent' };
	},

	resendInvite: async (event) => {
		const { params, locals } = event;
		const supabase = locals.supabase;
		const adminClient = getAdminClient();
		const { userId } = params;

		const sessionUser = locals.user;
		if (!sessionUser) return fail(401, { error: 'Unauthorized' });

		const role = await getAdminRole(supabase, sessionUser.id);
		if (!role || !canAccessPage(role, 'users')) {
			return fail(403, { error: 'Forbidden' });
		}

		// Get user email
		const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId);
		if (authError || !authUser?.user?.email) {
			return fail(404, { error: 'User not found' });
		}

		const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
			authUser.user.email
		);

		if (inviteError) {
			return fail(500, { error: 'Failed to resend invite' });
		}

		await auditLog(
			{
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: userId,
				details: { targetEmail: authUser.user.email },
				severity: 'info'
			},
			getRequestInfo(event)
		);

		return { success: true, message: 'Invite email resent' };
	}
};
