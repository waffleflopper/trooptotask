import type { HydrationPlannerPort, OrgWorkspacePort, WorkspaceBootstrap, WorkspaceKey } from '../orgShell';
import { loadOrgWorkspace } from './loadOrgWorkspace';

export async function loadOrgWorkspaceRouteData<T, K extends WorkspaceKey>(
	workspace: K,
	workspacePort: OrgWorkspacePort,
	plannerPort: HydrationPlannerPort
): Promise<Record<K, WorkspaceBootstrap<T>>> {
	return {
		[workspace]: await loadOrgWorkspace<T>(workspace, workspacePort, plannerPort)
	} as Record<K, WorkspaceBootstrap<T>>;
}
