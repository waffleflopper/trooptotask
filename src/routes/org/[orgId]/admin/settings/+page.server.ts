import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { data } = await locals.supabase
		.from('organizations')
		.select('archive_retention_months')
		.eq('id', params.orgId)
		.single();

	return {
		retentionMonths: data?.archive_retention_months ?? 36
	};
};
