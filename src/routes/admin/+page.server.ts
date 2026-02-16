import type { PageServerLoad } from './$types';
import type { AdminMetrics } from '$lib/types/subscription';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;

	// Get total users count
	const { count: totalUsers } = await supabase
		.from('user_subscriptions')
		.select('*', { count: 'exact', head: true });

	// Get subscription counts by plan
	const { data: planCounts } = await supabase
		.from('user_subscriptions')
		.select('plan_id')
		.then((result) => {
			const counts: Record<string, number> = { free: 0, pro: 0, team: 0 };
			(result.data ?? []).forEach((row: { plan_id: string }) => {
				counts[row.plan_id] = (counts[row.plan_id] || 0) + 1;
			});
			return { data: counts };
		});

	// Get active (non-free) subscriptions
	const { count: activeSubscriptions } = await supabase
		.from('user_subscriptions')
		.select('*', { count: 'exact', head: true })
		.neq('plan_id', 'free')
		.in('status', ['active', 'trialing']);

	// Get past due users
	const { count: pastDueUsers } = await supabase
		.from('user_subscriptions')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'past_due');

	// Calculate MRR from subscription plans
	const { data: mrrData } = await supabase
		.from('user_subscriptions')
		.select('plan_id, billing_cycle, subscription_plans(price_monthly, price_quarterly, price_semiannual)')
		.in('status', ['active', 'trialing'])
		.neq('plan_id', 'free');

	let mrr = 0;
	(mrrData ?? []).forEach((sub: any) => {
		const plan = sub.subscription_plans;
		if (!plan) return;

		let monthlyEquiv = 0;
		switch (sub.billing_cycle) {
			case 'monthly':
				monthlyEquiv = plan.price_monthly;
				break;
			case 'quarterly':
				monthlyEquiv = Math.round(plan.price_quarterly / 3);
				break;
			case 'semiannual':
				monthlyEquiv = Math.round(plan.price_semiannual / 6);
				break;
		}
		mrr += monthlyEquiv;
	});

	// Get new users this month
	const startOfMonth = new Date();
	startOfMonth.setDate(1);
	startOfMonth.setHours(0, 0, 0, 0);

	const { count: newUsersThisMonth } = await supabase
		.from('user_subscriptions')
		.select('*', { count: 'exact', head: true })
		.gte('created_at', startOfMonth.toISOString());

	// Get churned this month (canceled this month)
	const { count: churnedThisMonth } = await supabase
		.from('user_subscriptions')
		.select('*', { count: 'exact', head: true })
		.eq('status', 'canceled')
		.gte('canceled_at', startOfMonth.toISOString());

	// Get recent payments
	const { data: recentPayments } = await supabase
		.from('payment_history')
		.select('id, amount, status, created_at')
		.order('created_at', { ascending: false })
		.limit(5);

	// Get recent admin actions
	const { data: recentActions } = await supabase
		.from('admin_audit_log')
		.select('id, action, target_user_id, created_at')
		.order('created_at', { ascending: false })
		.limit(5);

	const metrics: AdminMetrics = {
		totalUsers: totalUsers ?? 0,
		activeSubscriptions: activeSubscriptions ?? 0,
		freeUsers: planCounts?.free ?? 0,
		proUsers: planCounts?.pro ?? 0,
		teamUsers: planCounts?.team ?? 0,
		pastDueUsers: pastDueUsers ?? 0,
		mrr,
		newUsersThisMonth: newUsersThisMonth ?? 0,
		churnedThisMonth: churnedThisMonth ?? 0
	};

	return {
		metrics,
		recentPayments: recentPayments ?? [],
		recentActions: recentActions ?? []
	};
};
