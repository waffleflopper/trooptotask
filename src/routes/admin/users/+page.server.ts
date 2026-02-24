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

	const userIds = (subscriptions ?? []).map((s: any) => s.user_id);

	// Skip additional queries if no users
	if (userIds.length === 0) {
		return {
			users: [],
			totalCount: 0,
			page,
			limit,
			search,
			planFilter: plan,
			statusFilter: status
		};
	}

	// Run all supplementary queries in parallel
	const [orgCountsResult, paymentsResult, authUsersResult] = await Promise.all([
		// Organization counts (as owner)
		supabase
			.from('organization_memberships')
			.select('user_id')
			.eq('role', 'owner')
			.in('user_id', userIds),

		// Payment data: amount and date in single query
		supabase
			.from('payment_history')
			.select('user_id, amount, created_at')
			.in('user_id', userIds)
			.eq('status', 'succeeded')
			.order('created_at', { ascending: false }),

		// User emails from auth (admin API limitation: can't filter by IDs)
		adminClient.auth.admin.listUsers({ perPage: 1000 })
	]);

	// Build org count map
	const orgCountMap: Record<string, number> = {};
	(orgCountsResult.data ?? []).forEach((m: { user_id: string }) => {
		orgCountMap[m.user_id] = (orgCountMap[m.user_id] || 0) + 1;
	});

	// Build payment maps (total and last payment) from single query
	const paymentMap: Record<string, number> = {};
	const lastPaymentMap: Record<string, string> = {};
	(paymentsResult.data ?? []).forEach((p: { user_id: string; amount: number; created_at: string }) => {
		paymentMap[p.user_id] = (paymentMap[p.user_id] || 0) + p.amount;
		// First occurrence is most recent due to ORDER BY
		if (!lastPaymentMap[p.user_id]) {
			lastPaymentMap[p.user_id] = p.created_at;
		}
	});

	// Build email map (filter to only users we need)
	const emailMap: Record<string, string> = {};
	if (authUsersResult.error) {
		console.error('[admin/users] auth.admin.listUsers error:', authUsersResult.error);
	}
	const userIdSet = new Set(userIds);
	if (authUsersResult.data?.users) {
		authUsersResult.data.users.forEach((u) => {
			if (u.email && userIdSet.has(u.id)) {
				emailMap[u.id] = u.email;
			}
		});
	}

	// If listUsers failed or returned no matches, fall back to fetching individually
	const missingIds = userIds.filter((id) => !emailMap[id]);
	if (missingIds.length > 0 && missingIds.length <= 20) {
		await Promise.all(
			missingIds.map(async (id) => {
				const { data, error } = await adminClient.auth.admin.getUserById(id);
				if (error) {
					console.error(`[admin/users] getUserById error for ${id}:`, error);
				} else if (data.user?.email) {
					emailMap[id] = data.user.email;
				}
			})
		);
	}

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
