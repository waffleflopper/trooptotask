import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

import { listPersonnelCounselingRecords } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelCounselingsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelCounselingsPageLoad(deps: PersonnelCounselingsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-counselings');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const personnelId = person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelCounselingRecords(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Counselings',
			emptyState: 'No counseling records have been added for this Soldier yet.',
			records
		};
	};
}

export const load = _createPersonnelCounselingsPageLoad();
