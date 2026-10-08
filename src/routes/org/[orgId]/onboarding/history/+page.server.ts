import { createRequestOnboardingWorkspaceContext } from '$lib/server/adapters/featureRequestContexts.server';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fetchOnboardingWorkspace } from '$features/onboarding/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core', 'app:onboarding-data');
	const { data } = await loadWithContext(locals, cookies, params.orgId, {
		context: createRequestOnboardingWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
		policyResource: { kind: 'unscoped' },
		fn: (ctx) => fetchOnboardingWorkspace(ctx, { mode: 'history' })
	});
	return {
		session: locals.session,
		history: { onboardings: data.onboardings, personnel: data.personnel, templates: data.onboardingTemplates }
	};
};
