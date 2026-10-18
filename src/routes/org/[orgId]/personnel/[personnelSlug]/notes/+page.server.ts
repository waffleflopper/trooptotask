import { listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelLeaderNoteContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelNotesPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelNotesPageLoad(deps: PersonnelNotesPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-notes');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const personnelId = person.id;
		const notes = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelLeaderNoteContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelLeaderNotes(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Notes',
			emptyState: 'No leader notes have been added for this Soldier yet.',
			notes
		};
	};
}

export const load = _createPersonnelNotesPageLoad();
