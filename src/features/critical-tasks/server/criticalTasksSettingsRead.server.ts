import type { CriticalTasksSettings } from '../criticalTasks.types';
import { normalizeCriticalTasksSettings } from '../utils/ictStatus';

interface CriticalTasksSettingsQueryContext {
	auth: { orgId: string };
	store: {
		findOne<T>(table: string, orgId: string, filters: Record<string, unknown>, select?: string): Promise<T | null>;
	};
}

interface OrgCriticalTasksSettingsRow {
	critical_tasks_default_expiration_months?: number | null;
	critical_tasks_expiring_soon_warning_days?: number | null;
}

export async function fetchCriticalTasksSettings(
	ctx: CriticalTasksSettingsQueryContext
): Promise<CriticalTasksSettings> {
	const orgId = ctx.auth.orgId;
	const settingsRow = await ctx.store.findOne<OrgCriticalTasksSettingsRow>(
		'organizations',
		orgId,
		{ id: orgId },
		'critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
	);

	return normalizeCriticalTasksSettings({
		defaultExpirationMonths: settingsRow?.critical_tasks_default_expiration_months ?? null,
		expiringSoonWarningDays: settingsRow?.critical_tasks_expiring_soon_warning_days ?? null
	});
}
