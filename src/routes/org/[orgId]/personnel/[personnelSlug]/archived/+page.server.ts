import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArchivedArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import type { PersonnelArchivedPageData } from '$features/personnel/contracts';
import type { PageServerLoadEvent } from './$types';

import { listPersonnelArchivedArtifacts } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelArchivedPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelArchivedPageLoad(deps: PersonnelArchivedPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent): Promise<PersonnelArchivedPageData> => {
		const { params, locals, cookies } = event;
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		return loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArchivedArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => ({
				archived: keepStreamedRejectionObserved(
					listPersonnelArchivedArtifacts(ctx.artifacts, ctx.leaderNotes, person.id)
				)
			})
		});
	};
}

export const load = _createPersonnelArchivedPageLoad();
