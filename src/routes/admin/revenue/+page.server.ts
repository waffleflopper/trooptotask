import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const supabase = locals.supabase;

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 50;
	const offset = (page - 1) * limit;

	// Get all payments with pagination
	const { data: payments, count } = await supabase
		.from('payment_history')
		.select('*', { count: 'exact' })
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	// Calculate totals
	const { data: allPayments } = await supabase
		.from('payment_history')
		.select('amount, status, created_at');

	let totalRevenue = 0;
	let thisMonthRevenue = 0;
	let lastMonthRevenue = 0;
	let failedPayments = 0;

	const now = new Date();
	const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

	(allPayments ?? []).forEach((p: any) => {
		const paymentDate = new Date(p.created_at);

		if (p.status === 'succeeded') {
			totalRevenue += p.amount;

			if (paymentDate >= thisMonthStart) {
				thisMonthRevenue += p.amount;
			} else if (paymentDate >= lastMonthStart && paymentDate <= lastMonthEnd) {
				lastMonthRevenue += p.amount;
			}
		} else if (p.status === 'failed') {
			failedPayments++;
		}
	});

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
