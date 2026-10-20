import {
	LEADER_NOTES_FIRST_PAGE,
	countPersonnelLeaderNotes,
	listPersonnelFollowUps,
	listPersonnelLeaderNotes
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import {
	createRequestPersonnelArtifactsContext,
	createRequestPersonnelLeaderNoteContext
} from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import type { PersonnelLogPageData } from '$features/personnel/contracts';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelLogPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelLogPageLoad(deps: PersonnelLogPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent): Promise<PersonnelLogPageData> => {
		const { params, locals, cookies } = event;
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const [followUps, notes] = await Promise.all([
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelArtifactsContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => ({ followUps: keepStreamedRejectionObserved(listPersonnelFollowUps(ctx, person.id)) })
			}),
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelLeaderNoteContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => ({
					notes: keepStreamedRejectionObserved(
						Promise.all([
							listPersonnelLeaderNotes(ctx, person.id, LEADER_NOTES_FIRST_PAGE),
							countPersonnelLeaderNotes(ctx, person.id)
						]).then(([notes, total]) => ({ notes, total }))
					)
				})
			})
		]);
		return { ...followUps, ...notes };
	};
}

export const load = _createPersonnelLogPageLoad();
