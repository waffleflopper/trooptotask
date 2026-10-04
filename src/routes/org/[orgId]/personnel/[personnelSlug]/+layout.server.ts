import { loadPersonnelDetailHeader } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelDetailContext } from '$lib/server/adapters/requestContexts.server';
import type { LayoutServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailLayoutLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDetailLayoutLoad(deps: PersonnelDetailLayoutLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: LayoutServerLoadEvent) => {
		depends('app:personnel-detail-header');
		const { orgId, personnelSlug } = params;

		const personnelDetailHeader = await loadWithContextFn(locals, cookies, orgId, {
			context: createRequestPersonnelDetailContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => loadPersonnelDetailHeader(ctx, personnelSlug)
		});

		return {
			personnelDetailHeader
		};
	};
}

export const load = _createPersonnelDetailLayoutLoad();
