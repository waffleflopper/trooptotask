import { createRequestOnboardingWorkspaceContext } from '$lib/server/adapters/featureRequestContexts.server';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fetchOnboardingWorkspace } from '$features/onboarding/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core', 'app:onboarding-data');
	return {
		history: await loadWithContext(locals, cookies, params.orgId, {
			context: createRequestOnboardingWorkspaceContext,
			policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
			policyResource: { kind: 'unscoped' },
			defer: true,
			fn: async (ctx) => {
				const { data } = await fetchOnboardingWorkspace(ctx, { mode: 'history' });
				return {
					onboardings: data.onboardings,
					personnel: data.personnel,
					templates: data.onboardingTemplates,
					groups: data.groups,
					noteAuthors: data.noteAuthors,
					archiveRetentionMonths: data.archiveRetentionMonths
				};
			}
		})
	};
};
