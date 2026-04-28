import type { PageServerLoad } from './$types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { OrganizationSettingsRow } from '../settingsRows.server';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	return loadWithContext(locals, cookies, params.orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const data = await ctx.rawStore.findOne<OrganizationSettingsRow>(
				'organizations',
				ctx.auth.orgId,
				{},
				'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
			);

			return {
				retentionMonths: data?.archive_retention_months ?? 36,
				lossWarningWindowDays: data?.loss_warning_window_days ?? 180,
				criticalTasksSettings: normalizeCriticalTasksSettings({
					defaultExpirationMonths: data?.critical_tasks_default_expiration_months ?? null,
					expiringSoonWarningDays: data?.critical_tasks_expiring_soon_warning_days ?? null
				})
			};
		}
	});
};
