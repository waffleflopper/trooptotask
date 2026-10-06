import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	await loadWithContext(locals, cookies, orgId, {
		context: createRequestEmptyContext,
		policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		policyResource: { kind: 'organization' },
		fn: async () => undefined
	});

	const parentData = await parent();
	const onboardingWorkspace = await parentData.onboarding.data;

	return {
		session: locals.session,
		orgId,
		templates: onboardingWorkspace.data.onboardingTemplates,
		templateSteps: onboardingWorkspace.data.onboardingTemplateSteps,
		trainingTypes: onboardingWorkspace.data.trainingTypes
	};
};
