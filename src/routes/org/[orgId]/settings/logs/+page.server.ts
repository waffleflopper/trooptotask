import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { getAdminClient } from '$lib/server/supabase';
import { loadLogsSettings, type LogsSettingsData } from '../settingsLogs.server';
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
		orgName: organization.name,
		effectiveTier: organization.effectiveTier
	};

	return loadWithContext<LogsPageData>(event.locals, event.cookies, common.orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => {
			const adminStore = createSupabaseDataStore(getAdminClient());

			return {
				...common,
				logsSettings: await loadLogsSettings(ctx, adminStore)
			};
		}
	});
};
