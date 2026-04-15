import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { data } = await locals.supabase
		.from('organizations')
		.select('archive_retention_months, loss_warning_window_days')
		.eq('id', params.orgId)
		.single();

	return {
		retentionMonths: data?.archive_retention_months ?? 36,
		lossWarningWindowDays: data?.loss_warning_window_days ?? 180
	};
};
