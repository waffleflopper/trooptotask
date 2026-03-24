import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';

export const load: PageServerLoad = loadWithAdminContext({
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: userStats } = await adminClient.rpc('count_platform_users');
		const { data: signupTrend } = await adminClient.rpc('daily_signups_last_30_days');

		const { count: totalOrganizations } = await adminClient
			.from('organizations')
			.select('*', { count: 'exact', head: true })
			.is('demo_type', null);

		const { data: orgTiers } = await adminClient.from('organizations').select('tier, gift_tier').is('demo_type', null);

		const tierCounts = { free: 0, team: 0, unit: 0 };
		for (const org of orgTiers ?? []) {
			const effectiveTier = org.gift_tier ?? org.tier ?? 'free';
			if (effectiveTier in tierCounts) {
				tierCounts[effectiveTier as keyof typeof tierCounts]++;
			}
		}

		const { count: pendingAccessRequests } = await adminClient
			.from('access_requests')
			.select('*', { count: 'exact', head: true })
			.eq('status', 'pending');

		const { count: pendingFeedback } = await adminClient
			.from('beta_feedback')
			.select('*', { count: 'exact', head: true })
			.eq('status', 'new');

		const { data: recentActivity } = await adminClient
			.from('audit_logs')
			.select('*')
			.order('timestamp', { ascending: false })
			.limit(10);

		return {
			userStats: userStats ?? { total: 0, last_30_days: 0 },
			signupTrend: signupTrend ?? [],
			totalOrganizations: totalOrganizations ?? 0,
			tierCounts,
			pendingAccessRequests: pendingAccessRequests ?? 0,
			pendingFeedback: pendingFeedback ?? 0,
			recentActivity: recentActivity ?? []
		};
	}
});
