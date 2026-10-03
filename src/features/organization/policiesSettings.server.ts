import type { PoliciesSettingsActor } from './policiesSettingsTypes';
import type { OrganizationSettingsReader } from './settingsTypes';
import { buildPoliciesSettingsData } from './policiesSettings';

export async function loadPoliciesSettings(
	ctx: { auth: PoliciesSettingsActor; organizationSettings: Pick<OrganizationSettingsReader, 'findPolicies'> },
	input: { isAdmin: boolean }
) {
	const organizationSettings = await ctx.organizationSettings.findPolicies(ctx.auth.orgId);
	return buildPoliciesSettingsData(ctx, { ...input, organizationSettings });
}
