import type { OrganizationSettingsReader } from '$features/organization/contracts';
import type { CriticalTasksSettings } from '../criticalTasks.types';
import { normalizeCriticalTasksSettings } from '../utils/ictStatus';

interface CriticalTasksSettingsQueryContext {
	auth: { orgId: string };
	organizationSettings: Pick<OrganizationSettingsReader, 'findCriticalTasksDefaults'>;
}

export async function fetchCriticalTasksSettings(
	ctx: CriticalTasksSettingsQueryContext
): Promise<CriticalTasksSettings> {
	const settingsRow = await ctx.organizationSettings.findCriticalTasksDefaults(ctx.auth.orgId);

	return normalizeCriticalTasksSettings({
		defaultExpirationMonths: settingsRow?.defaultExpirationMonths ?? null,
		expiringSoonWarningDays: settingsRow?.expiringSoonWarningDays ?? null
	});
}
