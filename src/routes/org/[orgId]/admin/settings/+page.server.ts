import type { PageServerLoad } from './$types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { data } = await locals.supabase
		.from('organizations')
		.select(
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		)
		.eq('id', params.orgId)
		.single();

	return {
		retentionMonths: data?.archive_retention_months ?? 36,
		lossWarningWindowDays: data?.loss_warning_window_days ?? 180,
		criticalTasksSettings: normalizeCriticalTasksSettings({
			defaultExpirationMonths: data?.critical_tasks_default_expiration_months ?? null,
			expiringSoonWarningDays: data?.critical_tasks_expiring_soon_warning_days ?? null
		})
	};
};
