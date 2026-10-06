import type { PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestActorContext } from '$lib/server/adapters/requestContexts.server';
import { createSupabaseOrganizationAuditStore } from '$lib/audit/index.server';
import { createSupabaseStatusTypeNamesReader } from '$features/calendar/index.server';
import { createSupabasePersonnelNamesReader } from '$features/personnel/index.server';
import { createSupabaseTrainingTypeNamesReader } from '$features/training/index.server';
import { createSupabaseOrganizationMemberEmailsReader } from '$features/organization/index.server';
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
		orgName: organization.name
	};

	return loadWithContext<LogsPageData, ReturnType<typeof createRequestActorContext>>(
		event.locals,
		event.cookies,
		common.orgId,
		{
			context: createRequestActorContext,
			policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
			policyResource: { kind: 'organization' },
			fn: async (ctx) => {
				const adminClient = getAdminClient();

				return {
					...common,
					logsSettings: await loadLogsSettings(ctx, createSupabaseOrganizationAuditStore(adminClient), {
						personnelNames: createSupabasePersonnelNamesReader(adminClient, ctx.auth.orgId),
						trainingTypeNames: createSupabaseTrainingTypeNamesReader(adminClient, ctx.auth.orgId),
						statusTypeNames: createSupabaseStatusTypeNamesReader(adminClient, ctx.auth.orgId),
						actorEmails: createSupabaseOrganizationMemberEmailsReader(adminClient, ctx.auth.orgId)
					})
				};
			}
		}
	);
};
