import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { streamDashboardWorkspaceBootstrap, type DashboardWorkspaceRouteData } from './dashboardWorkspace.server';

export interface DashboardLayoutLoadDeps {
	streamDashboardWorkspace?: (context: FeatureLaneWorkspaceRequestContext) => Promise<DashboardWorkspaceRouteData>;
}

export function _createDashboardLayoutLoad(deps: DashboardLayoutLoadDeps = {}): LayoutServerLoad {
	const streamDashboardWorkspace = deps.streamDashboardWorkspace ?? streamDashboardWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:dashboard-data'],
			streamWorkspace: streamDashboardWorkspace
		});
}

export const load: LayoutServerLoad = _createDashboardLayoutLoad();
