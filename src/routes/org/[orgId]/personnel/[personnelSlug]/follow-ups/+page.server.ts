import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { PageServerLoadEvent } from './$types';

import { listPersonnelFollowUps } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelFollowUpsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelFollowUpsPageLoad(deps: PersonnelFollowUpsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-follow-ups');
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const personnelId = person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelArtifactsContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelFollowUps(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Follow-ups',
			emptyState: 'No follow-ups have been added for this Soldier yet.',
			records
		};
	};
}

export const load = _createPersonnelFollowUpsPageLoad();
