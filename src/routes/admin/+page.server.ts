import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async () => {
	const adminClient = getAdminClient();

	// Replace listUsers with RPC that handles >1000 users
	const { data: userStats } = await adminClient.rpc('count_platform_users');

	// Signup trend for last 30 days (CSS bar chart data)
	const { data: signupTrend } = await adminClient.rpc('daily_signups_last_30_days');

	// Organization count
	const { count: totalOrganizations } = await adminClient
		.from('organizations')
		.select('*', { count: 'exact', head: true })
		.is('demo_type', null);

	// Subscription tier breakdown
	const { data: orgTiers } = await adminClient
		.from('organizations')
		.select('subscription_tier, gift_tier')
		.is('demo_type', null);

	const tierCounts = { free: 0, team: 0, unit: 0 };
	for (const org of orgTiers ?? []) {
		const effectiveTier = org.gift_tier ?? org.subscription_tier ?? 'free';
		if (effectiveTier in tierCounts) {
			tierCounts[effectiveTier as keyof typeof tierCounts]++;
		}
	}

	// Pending access requests
	const { count: pendingAccessRequests } = await adminClient
		.from('access_requests')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'pending');

	// Pending feedback count
	const { count: pendingFeedback } = await adminClient
		.from('beta_feedback')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'new');

	// Recent activity from audit_logs (canonical table, not admin_audit_log)
	const { data: recentActivity } = await adminClient
		.from('audit_logs')
		.select('*')
		.order('timestamp', { ascending: false })
		.limit(10);

	return {
		userStats: userStats ?? { total: 0, recent_30_days: 0 },
		signupTrend: signupTrend ?? [],
		totalOrganizations: totalOrganizations ?? 0,
		tierCounts,
		pendingAccessRequests: pendingAccessRequests ?? 0,
		pendingFeedback: pendingFeedback ?? 0,
		recentActivity: recentActivity ?? []
	};
};
