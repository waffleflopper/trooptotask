import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationAuditLogContext } from '$lib/server/adapters/requestContexts.server';
import { viewerTimeZone } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import { loadLogsSettings } from '../settingsLogs.server';
import type { LogsSettingsData } from '../settingsSectionTypes';
import {
	loadSettingsOrganization,
	buildCommonSettingsPageData,
	type CommonSettingsPageData
} from '../settingsLoad.server';

interface LogsPageData extends CommonSettingsPageData {
	logsSettings: LogsSettingsData;
}

export const load: PageServerLoad = async (event) => {
	event.depends('app:org-core');
	event.depends(VIEWER_DAY_DEPENDENCY);
	const organization = await loadSettingsOrganization(event);
	if (organization.suspendedAt) return {};

	return loadWithContext<LogsPageData, ReturnType<typeof createRequestOrganizationAuditLogContext>>(
		event.locals,
		event.cookies,
		organization.id,
		{
			context: createRequestOrganizationAuditLogContext,
			policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			policyResource: { kind: 'organization' },
			fn: async (ctx) => ({
				...buildCommonSettingsPageData(organization, ctx.auth),
				logsSettings: await loadLogsSettings(ctx, ctx.auditStore, ctx.auditLabels, {
					timeZone: viewerTimeZone(event.cookies),
					now: new Date()
				})
			})
		}
	);
};
