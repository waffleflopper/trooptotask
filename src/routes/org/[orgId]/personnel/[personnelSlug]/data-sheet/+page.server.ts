import type { PersonnelDataSheetPageData } from '$features/personnel/contracts';
import { readPersonnelExtendedInfo } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelExtendedInfoContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDataSheetPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDataSheetPageLoad(deps: PersonnelDataSheetPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent): Promise<PersonnelDataSheetPageData> => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-data-sheet');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);

		return loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelExtendedInfoContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => ({
				dataSheet: keepStreamedRejectionObserved(readPersonnelExtendedInfo(ctx, person.id))
			})
		});
	};
}

export const load = _createPersonnelDataSheetPageLoad();
