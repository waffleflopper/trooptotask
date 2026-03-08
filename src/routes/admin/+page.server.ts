import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const adminClient = getAdminClient();

	// Get total users count from auth
	const { data: authResult } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
	const totalUsers = authResult?.users?.length ?? 0;

	// Count users created this month
	const startOfMonth = new Date();
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);
	const newUsersThisMonth = (authResult?.users ?? []).filter(
		(u) => new Date(u.created_at) >= startOfMonth
	).length;

	// Get total organizations count
	const { count: totalOrganizations } = await supabase
		.from('organizations')
		.select('*', { count: 'exact', head: true });

	// Get pending access requests count
	const { count: pendingAccessRequests } = await supabase
		.from('access_requests')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'pending');

	// Get recent admin actions
	const { data: recentActions } = await supabase
		.from('admin_audit_log')
		.select('id, action, target_user_id, created_at')
		.order('created_at', { ascending: false })
		.limit(5);

	return {
		metrics: {
			totalUsers,
			totalOrganizations: totalOrganizations ?? 0,
			newUsersThisMonth
		},
		recentActions: recentActions ?? [],
		pendingAccessRequests: pendingAccessRequests ?? 0
	};
};
