import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';

export type ToolbarActionPriority = 'low' | 'normal' | 'high' | 'critical';
export type ToolbarActionDisplayMode = 'auto' | 'full' | 'compact';
export type ToolbarActionOverflowPolicy = 'auto' | 'always' | 'never';
export type ToolbarActionVariant = 'default' | 'primary' | 'secondary' | 'danger';
export type ToolbarActionIcon =
	| 'book-open'
	| 'calendar-days'
	| 'chart'
	| 'clipboard-check'
	| 'clipboard-list'
	| 'download'
	| 'settings'
	| 'upload';
export type ToolbarActionLayoutMode = 'full' | 'compact' | 'overflow';
export type ToolbarSearchItemMode = 'auto' | 'full' | 'compact';
export type ToolbarSearchPanelMode = 'inline';
export type ToolbarPanelMode = 'inline';
export type ToolbarStatefulControlMode = 'auto' | 'full' | 'compact';

export interface ToolbarAction {
	id: string;
	label: string;
	href?: string;
	onclick?: () => void;
	menuItems?: OverflowItem[];
	toggle?: boolean;
	active?: boolean;
	disabled?: boolean;
	disabledReason?: string;
	icon?: ToolbarActionIcon;
	priority?: ToolbarActionPriority;
	displayMode?: ToolbarActionDisplayMode;
	overflow?: ToolbarActionOverflowPolicy;
	variant?: ToolbarActionVariant;
}

export interface MeasuredToolbarAction extends ToolbarAction {
	fullWidth: number;
	compactWidth: number;
}

export interface ToolbarActionState {
	action: MeasuredToolbarAction;
	mode: ToolbarActionLayoutMode;
}

export interface ToolbarActionLayout {
	states: ToolbarActionState[];
	overflowActions: MeasuredToolbarAction[];
	warnings: string[];
}

export interface ToolbarActionMeasurement {
	fullWidth: number;
	compactWidth: number;
}

export const toolbarPriorityRank: Record<ToolbarActionPriority, number> = {
	low: 0,
	normal: 1,
	high: 2,
	critical: 3
};

export function getToolbarActionPriority(action: ToolbarAction): ToolbarActionPriority {
	return action.priority ?? 'normal';
}

export function getToolbarActionDisplayMode(action: ToolbarAction): ToolbarActionDisplayMode {
	return action.displayMode ?? 'auto';
}

export function getToolbarActionOverflowPolicy(action: ToolbarAction): ToolbarActionOverflowPolicy {
	return action.overflow ?? 'auto';
}

export function getToolbarActionVariant(action: ToolbarAction): ToolbarActionVariant {
	return action.variant ?? 'default';
}
