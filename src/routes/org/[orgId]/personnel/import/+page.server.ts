import type { PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelImportPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelImportPageLoad(deps: PersonnelImportPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:personnel-import');
		const { orgId } = params;

		return {
			personnelImport: await loadWithContextFn(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
				policyResource: { kind: 'unscoped' },
				fn: async () => ({})
			})
		};
	};
}

export const load = _createPersonnelImportPageLoad();
