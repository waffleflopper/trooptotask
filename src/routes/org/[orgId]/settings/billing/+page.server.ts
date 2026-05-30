import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { buildPlanUsageSummary, type PlanUsageSummary } from '$lib/server/core/useCases/planUsageSummary';
import { buildGeneralSettingsData } from '../settingsGeneral.server';
import { loadSettingsPage } from '../settingsLoad.server';
export { actions } from '../general/+page.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx, { common, organization }) => ({
		planUsageSummary: await loadPlanUsageSummary(ctx),
		generalSettings: buildGeneralSettingsData(ctx, {
			isAdmin: common.isAdmin,
			organization
		})
	}));

async function loadPlanUsageSummary(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<PlanUsageSummary> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	return buildPlanUsageSummary(policy, usage);
}
