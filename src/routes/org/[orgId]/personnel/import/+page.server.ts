import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelRecordContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
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

		// Access gates the page; the IDs stream so a failed read after a commit cannot replace the import's receipt.
		const { dodIds } = await loadWithContextFn(locals, cookies, orgId, {
			context: createRequestPersonnelRecordContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => ({ dodIds: keepStreamedRejectionObserved(ctx.personnelSheets.listDodIds()) })
		});
		return { personnelImport: keepStreamedRejectionObserved(dodIds.then((ids) => ({ dodIds: ids }))) };
	};
}

export const load = _createPersonnelImportPageLoad();
