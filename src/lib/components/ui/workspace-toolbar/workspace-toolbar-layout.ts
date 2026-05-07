import type { WorkspaceToolbarAction } from './types.js';

export type WorkspaceToolbarDensity = 'comfortable' | 'constrained' | 'tight';

export type WorkspaceToolbarLayoutContext = {
	width: number;
};

export const workspaceToolbarLayoutContextKey = Symbol('workspace-toolbar-layout');

export function getWorkspaceToolbarDensity(width: number): WorkspaceToolbarDensity {
	if (width <= 0) return 'comfortable';
	if (width < 560) return 'tight';
	if (width < 760) return 'constrained';
	return 'comfortable';
}

function actionPriority(action: WorkspaceToolbarAction): WorkspaceToolbarAction['priority'] {
	return action.priority ?? 'normal';
}

function shouldKeepActionVisible(action: WorkspaceToolbarAction, density: WorkspaceToolbarDensity): boolean {
	if (action.overflow === 'always') return false;
	if (action.overflow === 'never') return true;
	if (density === 'comfortable') return true;

	const priority = actionPriority(action);

	if (density === 'tight') {
		return priority === 'critical';
	}

	return priority === 'critical' || priority === 'high';
}

export function partitionWorkspaceToolbarActions(
	actions: WorkspaceToolbarAction[],
	density: WorkspaceToolbarDensity
): {
	visibleActions: WorkspaceToolbarAction[];
	overflowActions: WorkspaceToolbarAction[];
} {
	const visibleActions: WorkspaceToolbarAction[] = [];
	const overflowActions: WorkspaceToolbarAction[] = [];

	for (const action of actions) {
		if (shouldKeepActionVisible(action, density)) {
			visibleActions.push(action);
		} else {
			overflowActions.push(action);
		}
	}

	return { visibleActions, overflowActions };
}
