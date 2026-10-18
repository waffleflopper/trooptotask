import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

import { listPersonnelDocuments } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDocumentsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDocumentsPageLoad(deps: PersonnelDocumentsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-documents');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const personnelId = person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelDocuments(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Documents',
			emptyState: 'No documents have been uploaded for this Soldier yet.',
			records
		};
	};
}

export const load = _createPersonnelDocumentsPageLoad();
