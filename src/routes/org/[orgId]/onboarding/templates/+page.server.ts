import { createRequestOnboardingTemplateActivityContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fetchOnboardingTemplateActivity } from '$features/onboarding/index.server';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	const { orgId } = params;
	const activePacketCounts = await loadWithContext(locals, cookies, orgId, {
		context: createRequestOnboardingTemplateActivityContext,
		policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		policyResource: { kind: 'organization' },
		fn: fetchOnboardingTemplateActivity
	});

	return { orgId, activePacketCounts };
};
