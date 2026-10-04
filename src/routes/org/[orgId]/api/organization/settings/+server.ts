import type { OrganizationSettingsInput } from '$features/organization/contracts';
import { updateOrganizationSettings } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationPolicyContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig: RouteConfig<
	OrganizationSettingsInput,
	{ success: true },
	ReturnType<typeof createRequestOrganizationPolicyContext>
> = {
	context: createRequestOrganizationPolicyContext,
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' },
	mutation: true,
	fn: updateOrganizationSettings
};
export const POST = handle(_postConfig);
