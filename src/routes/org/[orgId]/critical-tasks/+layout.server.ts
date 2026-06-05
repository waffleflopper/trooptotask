import type { LayoutServerLoad } from './$types';
import {
	streamReadyFeatureLaneWorkspace,
	type FeatureLaneWorkspaceRequestContext
} from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamCriticalTasksWorkspaceBootstrap,
	type CriticalTasksWorkspaceRouteData
} from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';

export interface CriticalTasksLayoutLoadDeps {
	streamCriticalTasksWorkspace?: (
		context: FeatureLaneWorkspaceRequestContext
	) => Promise<CriticalTasksWorkspaceRouteData>;
}

export function _createCriticalTasksLayoutLoad(deps: CriticalTasksLayoutLoadDeps = {}): LayoutServerLoad {
	const streamCriticalTasksWorkspace = deps.streamCriticalTasksWorkspace ?? streamCriticalTasksWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:critical-tasks-data'],
			streamWorkspace: streamCriticalTasksWorkspace
		});
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
