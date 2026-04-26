import { getContext } from 'svelte';

export type ToolbarCompactPhase = 'full' | 'search' | 'group';
export type ToolbarPanelKind = 'search' | 'group' | 'overflow';

export const toolbarCoordinatorKey = Symbol('toolbar-coordinator');

export interface ToolbarCoordinator {
	readonly openPanelId: string | null;
	readonly compactPhase: ToolbarCompactPhase;
	readonly availableActionWidth: number | null;
	requestPanel(panelId: string, kind: ToolbarPanelKind): void;
	closePanel(panelId: string): void;
	closeAllPanels(): void;
}

export function getToolbarCoordinator(): ToolbarCoordinator | null {
	return getContext<ToolbarCoordinator | null>(toolbarCoordinatorKey) ?? null;
}
