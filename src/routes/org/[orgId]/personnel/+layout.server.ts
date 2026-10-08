import { listStatusTypes } from '$features/calendar/index.server';
import { PERSONNEL_WORKSPACE_LANE_KEY, type PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import { loadPersonnelWorkspace } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import { settleWorkspaceDenial } from '$lib/server/adapters/streamedWorkspace';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/adapters/featureLaneWorkspaceLoad';
import type { LayoutServerLoad } from './$types';

export interface PersonnelLayoutLoadDeps {
	streamPersonnelWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<PersonnelWorkspaceRouteData>;
}

async function streamPersonnelWorkspace(
	context: FeatureLaneWorkspaceRequestContext
): Promise<PersonnelWorkspaceRouteData> {
	const personnel = await loadWithContext(context.locals, context.cookies, context.orgId, {
		context: createRequestPersonnelWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) =>
			loadPersonnelWorkspace(ctx, {
				listStatusTypes: () => listStatusTypes(ctx.calendarCatalogs),
				loadLossWarningWindowDays: async (orgId) =>
					(await ctx.organizationSettings.findLossWarningWindowDays(orgId)) ?? null
			})
	});
	return { personnel: { data: settleWorkspaceDenial(personnel.data, PERSONNEL_WORKSPACE_LANE_KEY) } };
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:personnel-data'],
			streamWorkspace: deps.streamPersonnelWorkspace ?? streamPersonnelWorkspace
		});
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();
