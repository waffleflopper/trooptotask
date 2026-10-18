import { listStatusTypes } from '$features/calendar/index.server';
import { PERSONNEL_WORKSPACE_LANE_KEY, type PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import { loadPersonnelWorkspace } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import { settleWorkspaceDenial } from '$lib/server/adapters/streamedWorkspace';
import type { LayoutServerLoad, LayoutServerLoadEvent } from './$types';

type PersonnelWorkspaceRequest = Pick<LayoutServerLoadEvent, 'locals' | 'cookies' | 'params'>;

export interface PersonnelLayoutLoadDeps {
	streamPersonnelWorkspace?: (request: PersonnelWorkspaceRequest) => Promise<PersonnelWorkspaceRouteData>;
}

async function streamPersonnelWorkspace({
	locals,
	cookies,
	params
}: PersonnelWorkspaceRequest): Promise<PersonnelWorkspaceRouteData> {
	const personnel = await loadWithContext(locals, cookies, params.orgId, {
		context: createRequestPersonnelWorkspaceContext,
		policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
		policyResource: { kind: 'unscoped' },
		defer: true,
		fn: (ctx) =>
			loadPersonnelWorkspace(ctx, {
				listStatusTypes: () => listStatusTypes(ctx.calendarCatalogs),
				loadLossWarningWindowDays: (orgId) => ctx.organizationSettings.findLossWarningWindowDays(orgId)
			})
	});
	return { personnel: { data: settleWorkspaceDenial(personnel.data, PERSONNEL_WORKSPACE_LANE_KEY) } };
}

export function _createPersonnelLayoutLoad(deps: PersonnelLayoutLoadDeps = {}): LayoutServerLoad {
	return async (event) => {
		event.depends('app:org-core', 'app:personnel-data');
		// parent() would rerun the root and Organization loads on every Personnel refresh. Admission checks status.
		return (deps.streamPersonnelWorkspace ?? streamPersonnelWorkspace)(event);
	};
}

export const load: LayoutServerLoad = _createPersonnelLayoutLoad();
