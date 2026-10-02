import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { updateOrganizationSettings } from '$features/organization/index.server';
import type { OrganizationSettingsInput } from '$features/organization/contracts';

export const _postConfig: RouteConfig<OrganizationSettingsInput, { success: true }> = {
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' },
	mutation: true,
	fn: updateOrganizationSettings
};
export const POST = handle(_postConfig);
