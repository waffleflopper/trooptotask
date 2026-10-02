import type { LayoutServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import { loadPersonnelWorkspace } from '$features/personnel/index.server';
import type { PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import { listStatusTypes } from '$features/calendar/index.server';

export interface PersonnelLayoutLoadDeps {
	streamPersonnelWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<PersonnelWorkspaceRouteData>;
}

async function streamPersonnelWorkspace(
	context: FeatureLaneWorkspaceRequestContext
): Promise<PersonnelWorkspaceRouteData> {
	const personnel = await loadWithContext(context.locals, context.cookies, context.orgId, {
		policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) =>
			loadPersonnelWorkspace(ctx, {
				listStatusTypes: (orgId) => listStatusTypes(ctx.store, orgId),
				loadLossWarningWindowDays: async (orgId) =>
					(await ctx.organizationSettings.findLossWarningWindowDays(orgId)) ?? null
			})
	});
	return { personnel };
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:personnel-data'],
			streamWorkspace: deps.streamPersonnelWorkspace ?? streamPersonnelWorkspace
		});
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();
