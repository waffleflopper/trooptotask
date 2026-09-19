import type { PageServerLoad } from './$types';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readEffectivePlanPolicy, toEffectiveTierFromPlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { buildPlanUsageSummary } from '$lib/server/core/useCases/planUsageSummary';
import { loadSettingsPage } from '../settingsLoad.server';
export { actions } from '../general/+page.server';

export const load: PageServerLoad = (event) => loadSettingsPage(event, loadBillingSummary);

async function loadBillingSummary(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>) {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	return {
		planUsageSummary: buildPlanUsageSummary(policy, usage),
		effectiveTier: toEffectiveTierFromPlanPolicy(policy, usage)
	};
}
