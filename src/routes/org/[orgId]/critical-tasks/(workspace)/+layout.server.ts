import type { LayoutServerLoad } from './$types';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/adapters/featureLaneWorkspaceLoad';
import { streamCriticalTasksWorkspaceBootstrap } from './criticalTasksWorkspace.server';

export function _createCriticalTasksLayoutLoad(): LayoutServerLoad {
	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:critical-tasks-data'],
			streamWorkspace: streamCriticalTasksWorkspaceBootstrap
		});
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
