import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelRecordContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelImportPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelImportPageLoad(deps: PersonnelImportPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: PageServerLoadEvent) => {
		depends('app:personnel-import', 'app:personnel-data');
		const { orgId } = params;

		return {
			personnelImport: await loadWithContextFn(locals, cookies, orgId, {
				context: createRequestPersonnelRecordContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => ({ dodIds: await ctx.personnelSheets.listDodIds() })
			})
		};
	};
}

export const load = _createPersonnelImportPageLoad();
