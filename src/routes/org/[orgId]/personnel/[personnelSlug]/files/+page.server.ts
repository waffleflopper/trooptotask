import { readPersonnelCounselings, readPersonnelDocuments } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { viewerToday } from '$lib/server/viewerDay.server';
import type { PageServerLoadEvent } from './$types';

/** Each list opens on its newest records; the rest page in on request. */
const FIRST_PAGE = 3;

type LoadWithContext = typeof loadWithContext;

export interface PersonnelFilesPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelFilesPageLoad(deps: PersonnelFilesPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies } = event;
		event.depends('app:personnel-detail-files');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const asOf = viewerToday(cookies);
		const files = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx) => ({
				counselings: keepStreamedRejectionObserved(
					readPersonnelCounselings(ctx, { personnelId: person.id, asOf, limit: FIRST_PAGE })
				),
				documents: keepStreamedRejectionObserved(
					readPersonnelDocuments(ctx, { personnelId: person.id, limit: FIRST_PAGE })
				)
			})
		});
		return { asOf, files };
	};
}

export const load = _createPersonnelFilesPageLoad();
