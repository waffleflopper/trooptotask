import { listPersonnelFollowUps, listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import {
	createRequestPersonnelArtifactsContext,
	createRequestPersonnelLeaderNoteContext
} from '$lib/server/adapters/requestContexts.server';
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
		const personnelId = person.id;
		const [followUps, notes] = await Promise.all([
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelArtifactsContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => listPersonnelFollowUps(ctx, personnelId)
			}),
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelLeaderNoteContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => listPersonnelLeaderNotes(ctx, personnelId)
			})
		]);

		return {
			followUps: {
				orgId: params.orgId,
				personnelId,
				title: 'Follow-ups',
				emptyState: 'No follow-ups have been added for this Soldier yet.',
				records: followUps
			},
			notes: {
				orgId: params.orgId,
				personnelId,
				title: 'Notes',
				emptyState: 'No leader notes have been added for this Soldier yet.',
				notes
			}
		};
	};
}

export const load = _createPersonnelLogPageLoad();
