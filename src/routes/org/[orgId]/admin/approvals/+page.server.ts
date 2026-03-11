import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { data: requests } = await locals.supabase
		.from('deletion_requests')
		.select('*')
		.eq('organization_id', params.orgId)
		.order('created_at', { ascending: false });

	return { requests: requests ?? [] };
};
