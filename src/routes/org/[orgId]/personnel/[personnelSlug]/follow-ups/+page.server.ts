import { personnelArtifactsContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { PageServerLoadEvent } from './$types';
import type { PersonnelDetailHeader } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

import { listPersonnelFollowUps } from '$features/personnel/index.server';

type LoadWithContext = typeof loadWithContext;

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export interface PersonnelFollowUpsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelFollowUpsPageLoad(deps: PersonnelFollowUpsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail-follow-ups');
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelFollowUps(personnelArtifactsContext(ctx), personnelId)
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
