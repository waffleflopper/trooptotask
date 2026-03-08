import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const statusFilter = url.searchParams.get('status') ?? 'pending';

	let query = locals.supabase
		.from('deletion_requests')
		.select('*')
		.eq('organization_id', params.orgId)
		.order('created_at', { ascending: false });

	if (statusFilter !== 'all') {
		query = query.eq('status', statusFilter);
	}

	const { data: requests } = await query;
	return { requests: requests ?? [], statusFilter };
};
