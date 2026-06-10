import type { LayoutServerLoad } from './$types';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamCriticalTasksWorkspaceBootstrap,
	type CriticalTasksWorkspaceRequestContext,
	type CriticalTasksWorkspaceRouteData
} from '$features/critical-tasks/server/criticalTasksWorkspaceBootstrap';

export interface CriticalTasksLayoutLoadDeps {
	streamCriticalTasksWorkspace?: (
		context: CriticalTasksWorkspaceRequestContext
	) => Promise<CriticalTasksWorkspaceRouteData>;
}

function shouldIncludeArchivedIctTasks(pathname: string): boolean {
	return /\/critical-tasks\/library\/?$/.test(pathname);
}

export function _createCriticalTasksLayoutLoad(deps: CriticalTasksLayoutLoadDeps = {}): LayoutServerLoad {
	const streamCriticalTasksWorkspace = deps.streamCriticalTasksWorkspace ?? streamCriticalTasksWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace(event, {
			dependencies: ['app:org-core', 'app:critical-tasks-data'],
			createContext: (event, shell) => ({
				locals: event.locals,
				cookies: event.cookies,
				orgId: shell.org.id,
				includeArchivedTasks: shouldIncludeArchivedIctTasks(event.url.pathname)
			}),
			streamWorkspace: streamCriticalTasksWorkspace
		});
}

export const load: LayoutServerLoad = _createCriticalTasksLayoutLoad();
