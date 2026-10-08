import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');
	const { orgId } = params;
	await loadWithContext(locals, cookies, orgId, {
		context: createRequestEmptyContext,
		policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
		policyResource: { kind: 'organization' },
		fn: async () => undefined
	});

	return { session: locals.session, orgId };
};
