import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationAuditLogContext } from '$lib/server/adapters/requestContexts.server';
import { viewerTimeZone } from '$lib/server/viewerDay.server';
import { loadLogsSettings } from '../settingsLogs.server';
import type { LogsSettingsData } from '../settingsSectionTypes';
import {
	buildCommonSettingsPageData,
	buildSettingsPageOrganization,
	type CommonSettingsPageData
} from '../settingsLoad.server';

interface LogsPageData extends CommonSettingsPageData {
	logsSettings: LogsSettingsData;
}

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	if (parentData.shell.kind === 'suspended') return {};

	const organization = buildSettingsPageOrganization(parentData);
	const common = {
		...buildCommonSettingsPageData(parentData),
		orgUrlSegment: organization.urlSegment,
		orgUrlSlug: organization.urlSlug,
		orgName: organization.name
	};

	return loadWithContext<LogsPageData, ReturnType<typeof createRequestOrganizationAuditLogContext>>(
		event.locals,
		event.cookies,
		common.orgId,
		{
			context: createRequestOrganizationAuditLogContext,
			policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			policyResource: { kind: 'organization' },
			fn: async (ctx) => ({
				...common,
				logsSettings: await loadLogsSettings(ctx, ctx.auditStore, ctx.auditLabels, {
					timeZone: viewerTimeZone(event.cookies),
					now: new Date()
				})
			})
		}
	);
};
