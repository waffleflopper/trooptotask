import type { WorkspaceKey, WorkspaceBootstrap, OrgWorkspacePort, HydrationPlannerPort } from '../orgShell';

export async function loadOrgWorkspace<T>(
	workspace: WorkspaceKey,
	workspacePort: OrgWorkspacePort,
	plannerPort: HydrationPlannerPort
): Promise<WorkspaceBootstrap<T>> {
	const data = await workspacePort.getWorkspaceData<T>(workspace);
	const hydration = plannerPort.createPlan(workspace, data);

	return hydration ? { workspace, data, hydration } : { workspace, data };
}
