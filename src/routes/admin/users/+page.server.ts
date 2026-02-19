import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals, url }) => {
	const supabase = locals.supabase;
	const adminClient = getAdminClient();

	// Get search params
	const search = url.searchParams.get('search') || '';
	const plan = url.searchParams.get('plan') || '';
	const status = url.searchParams.get('status') || '';
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;
	const offset = (page - 1) * limit;

	// Build query
	let query = supabase
		.from('user_subscriptions')
		.select(`
			id,
			user_id,
			plan_id,
			status,
			billing_cycle,
			stripe_customer_id,
			created_at,
			updated_at,
			subscription_plans (name)
		`, { count: 'exact' });

	// Apply filters
	if (plan) {
		query = query.eq('plan_id', plan);
	}

	if (status) {
		query = query.eq('status', status);
	}

	// Order and paginate
	query = query
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	const { data: subscriptions, count } = await query;

	// Get user emails via auth.users lookup
	// Note: In production, you'd want to join this or use a view
	const userIds = (subscriptions ?? []).map((s: any) => s.user_id);

	// Get organization counts for each user
	const { data: orgCounts } = await supabase
		.from('organization_memberships')
		.select('user_id')
		.eq('role', 'owner')
		.in('user_id', userIds);

	const orgCountMap: Record<string, number> = {};
	(orgCounts ?? []).forEach((m: { user_id: string }) => {
		orgCountMap[m.user_id] = (orgCountMap[m.user_id] || 0) + 1;
	});

	// Get total payments for each user
	const { data: paymentTotals } = await supabase
		.from('payment_history')
		.select('user_id, amount')
		.in('user_id', userIds)
		.eq('status', 'succeeded');

	const paymentMap: Record<string, number> = {};
	(paymentTotals ?? []).forEach((p: { user_id: string; amount: number }) => {
		paymentMap[p.user_id] = (paymentMap[p.user_id] || 0) + p.amount;
	});

	// Get user emails from auth.users using admin client
	const emailMap: Record<string, string> = {};
	if (userIds.length > 0) {
		const { data: authUsers } = await adminClient.auth.admin.listUsers({
			perPage: 1000
		});
		if (authUsers?.users) {
			authUsers.users.forEach((u) => {
				if (u.email) {
					emailMap[u.id] = u.email;
				}
			});
		}
	}

	// Get last payment dates
	const { data: lastPayments } = await supabase
		.from('payment_history')
		.select('user_id, created_at')
		.in('user_id', userIds)
		.eq('status', 'succeeded')
		.order('created_at', { ascending: false });

	const lastPaymentMap: Record<string, string> = {};
	(lastPayments ?? []).forEach((p: { user_id: string; created_at: string }) => {
		if (!lastPaymentMap[p.user_id]) {
			lastPaymentMap[p.user_id] = p.created_at;
		}
	});

	// Transform data
	const users = (subscriptions ?? []).map((sub: any) => ({
		id: sub.user_id,
		email: emailMap[sub.user_id] || null,
		planId: sub.plan_id,
		planName: sub.subscription_plans?.name || sub.plan_id,
		status: sub.status,
		billingCycle: sub.billing_cycle,
		organizationCount: orgCountMap[sub.user_id] || 0,
		totalPaid: paymentMap[sub.user_id] || 0,
		lastPaymentAt: lastPaymentMap[sub.user_id] || null,
		createdAt: sub.created_at
	}));

	return {
		users,
		totalCount: count ?? 0,
		page,
		limit,
		search,
		planFilter: plan,
		statusFilter: status
	};
};
