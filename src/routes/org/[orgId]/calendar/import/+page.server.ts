import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestEmptyContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

export function _createStatusImportPageLoad(deps: { loadWithContext?: typeof loadWithContext } = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies }: PageServerLoadEvent) => ({
		ownsWorkspaceLoading: true,
		statusImport: await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestEmptyContext,
			policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
			policyResource: { kind: 'unscoped' },
			fn: async () => ({})
		})
	});
}

export const load = _createStatusImportPageLoad();
