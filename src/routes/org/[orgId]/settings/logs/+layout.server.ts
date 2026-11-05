import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationAuditLogContext } from '$lib/server/adapters/requestContexts.server';
import { loadLogsFilterOptions } from '../settingsLogs.server';
import { loadSettingsOrganization } from '../settingsLoad.server';
import type { LogsFilterOptions } from '../settingsSectionTypes';

/**
 * The picker lists load here, apart from the entries, because a layout load does not run again when only the filters in
 * the address change. Choosing a filter reads entries and nothing else.
 */
export const load: LayoutServerLoad = async (event) => {
	const organization = await loadSettingsOrganization(event);
	if (organization.suspendedAt) return {};

	return loadWithContext<
		{ filterOptions: Promise<LogsFilterOptions> },
		ReturnType<typeof createRequestOrganizationAuditLogContext>
	>(event.locals, event.cookies, organization.id, {
		context: createRequestOrganizationAuditLogContext,
		policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => ({
			filterOptions: loadLogsFilterOptions(ctx, {
				roster: ctx.roster,
				memberLabels: ctx.memberLabels,
				store: ctx.auditStore
			})
		})
	});
};
