import type { PersonnelDetailHeader } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArchivedArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

import { listPersonnelArchivedArtifacts } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export interface PersonnelArchivedPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelArchivedPageLoad(deps: PersonnelArchivedPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail-archived');
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArchivedArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelArchivedArtifacts(ctx.artifacts, ctx.leaderNotes, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Archived items',
			emptyState: 'No archived follow-ups, documents, counselings, or notes yet.',
			records
		};
	};
}

export const load = _createPersonnelArchivedPageLoad();
