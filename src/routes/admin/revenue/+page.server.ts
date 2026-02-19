import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const supabase = locals.supabase;

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 50;
	const offset = (page - 1) * limit;

	// Calculate date ranges for filtering
	const now = new Date();
	const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

	// Run queries in parallel for efficiency
	const [
		paymentsResult,
		totalRevenueResult,
		thisMonthResult,
		lastMonthResult,
		failedCountResult
	] = await Promise.all([
		// Paginated payments for display
		supabase
			.from('payment_history')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1),

		// Total revenue (all time, succeeded only) - just amounts
		supabase
			.from('payment_history')
			.select('amount')
			.eq('status', 'succeeded'),

		// This month revenue
		supabase
			.from('payment_history')
			.select('amount')
			.eq('status', 'succeeded')
			.gte('created_at', thisMonthStart.toISOString()),

		// Last month revenue
		supabase
			.from('payment_history')
			.select('amount')
			.eq('status', 'succeeded')
			.gte('created_at', lastMonthStart.toISOString())
			.lte('created_at', lastMonthEnd.toISOString()),

		// Failed payments count
		supabase
			.from('payment_history')
			.select('id', { count: 'exact', head: true })
			.eq('status', 'failed')
	]);

	const { data: payments, count } = paymentsResult;

	// Sum the amounts (much smaller data transfer than fetching all records)
	const totalRevenue = (totalRevenueResult.data ?? []).reduce((sum, p) => sum + p.amount, 0);
	const thisMonthRevenue = (thisMonthResult.data ?? []).reduce((sum, p) => sum + p.amount, 0);
	const lastMonthRevenue = (lastMonthResult.data ?? []).reduce((sum, p) => sum + p.amount, 0);
	const failedPayments = failedCountResult.count ?? 0;

	// Revenue growth
	const revenueGrowth = lastMonthRevenue > 0
		? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
		: 0;

	return {
		payments: (payments ?? []).map((p: any) => ({
			id: p.id,
			userId: p.user_id,
			amount: p.amount,
			currency: p.currency,
			status: p.status,
			description: p.description,
			receiptUrl: p.receipt_url,
			stripeInvoiceId: p.stripe_invoice_id,
			createdAt: p.created_at
		})),
		totalCount: count ?? 0,
		page,
		limit,
		stats: {
			totalRevenue,
			thisMonthRevenue,
			lastMonthRevenue,
			revenueGrowth,
			failedPayments
		}
	};
};
