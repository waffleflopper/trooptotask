import type { CriticalTasksSettings } from './criticalTasks.types';

export const criticalTasksWorkspaceStatus = $state<{
	orgId: string | null;
	settings: CriticalTasksSettings | null;
	pending: boolean;
	error: Error | null;
	refreshRequested: boolean;
}>({
	orgId: null,
	settings: null,
	pending: false,
	error: null,
	refreshRequested: false
});

// The workspace omits completions for archived tasks, so a restore attempt refreshes it after the next navigation.
export function requestCriticalTasksWorkspaceRefresh(): void {
	criticalTasksWorkspaceStatus.refreshRequested = true;
}

export function markCriticalTasksWorkspacePending(orgId: string | null | undefined): void {
	criticalTasksWorkspaceStatus.orgId = orgId ?? null;
	criticalTasksWorkspaceStatus.settings = null;
	criticalTasksWorkspaceStatus.pending = true;
	criticalTasksWorkspaceStatus.error = null;
	criticalTasksWorkspaceStatus.refreshRequested = false;
}

export function markCriticalTasksWorkspaceResolved(workspace: {
	hydration: { orgId: string };
	data: { settings: CriticalTasksSettings };
}): void {
	criticalTasksWorkspaceStatus.orgId = workspace.hydration.orgId;
	criticalTasksWorkspaceStatus.settings = workspace.data.settings;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = null;
}

export function markCriticalTasksWorkspaceRejected(error: Error, orgId: string | null | undefined): void {
	criticalTasksWorkspaceStatus.orgId = orgId ?? criticalTasksWorkspaceStatus.orgId;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = error;
}

export function resetCriticalTasksWorkspaceStatus(): void {
	criticalTasksWorkspaceStatus.orgId = null;
	criticalTasksWorkspaceStatus.settings = null;
	criticalTasksWorkspaceStatus.pending = false;
	criticalTasksWorkspaceStatus.error = null;
	criticalTasksWorkspaceStatus.refreshRequested = false;
}
