import type { Cookies } from '@sveltejs/kit';
import { listStatusTypes } from '$features/calendar/index.server';
import { PERSONNEL_WORKSPACE_LANE_KEY, type PersonnelWorkspaceRouteData } from '$features/personnel/contracts';
import { loadPersonnelWorkspace } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelWorkspaceContext } from '$lib/server/adapters/requestContexts.server';
import { settleWorkspaceDenial } from '$lib/server/adapters/streamedWorkspace';

export interface PersonnelWorkspaceRequest {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
}

/** The roster, Groups and rank catalog behind the Personnel pages and the setup steps that embed their editors. */
export async function streamPersonnelWorkspace({
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
