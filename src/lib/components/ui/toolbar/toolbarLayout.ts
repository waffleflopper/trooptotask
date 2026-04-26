import {
	getToolbarActionDisplayMode,
	getToolbarActionOverflowPolicy,
	getToolbarActionPriority,
	toolbarPriorityRank,
	type MeasuredToolbarAction,
	type ToolbarActionLayout,
	type ToolbarActionLayoutMode,
	type ToolbarActionState
} from './toolbar.types';

interface ComputeToolbarActionLayoutInput {
	containerWidth: number;
	actions: MeasuredToolbarAction[];
	overflowWidth: number;
	gapWidth: number;
}

function actionCanCompact(action: MeasuredToolbarAction): boolean {
	const displayMode = getToolbarActionDisplayMode(action);
	return Boolean(action.icon) && displayMode !== 'full' && action.compactWidth < action.fullWidth;
}

function getActionWidth(state: ToolbarActionState): number {
	return state.mode === 'compact' ? state.action.compactWidth : state.action.fullWidth;
}

function getVisibleWidth(states: ToolbarActionState[], overflowWidth: number, gapWidth: number): number {
	const visible = states.filter((state) => state.mode !== 'overflow');
	const hasOverflow = states.some((state) => state.mode === 'overflow');
	const visibleWidth = visible.reduce((sum, state) => sum + getActionWidth(state), 0);
	const visibleGaps = visible.length > 1 ? gapWidth * (visible.length - 1) : 0;
	const overflowGap = hasOverflow && visible.length > 0 ? gapWidth : 0;

	return visibleWidth + visibleGaps + overflowGap + (hasOverflow ? overflowWidth : 0);
}

function sortByYieldOrder(states: ToolbarActionState[]): ToolbarActionState[] {
	return [...states].sort((a, b) => {
		const priorityDelta =
			toolbarPriorityRank[getToolbarActionPriority(a.action)] - toolbarPriorityRank[getToolbarActionPriority(b.action)];
		if (priorityDelta !== 0) return priorityDelta;
		return states.indexOf(a) - states.indexOf(b);
	});
}

function buildProtectedWarning(
	containerWidth: number,
	states: ToolbarActionState[],
	overflowWidth: number,
	gapWidth: number
): string | null {
	const protectedStates = states.filter(
		(state) => state.mode !== 'overflow' && getToolbarActionOverflowPolicy(state.action) === 'never'
	);
	if (protectedStates.length === 0) return null;

	const protectedWidth = protectedStates.reduce((sum, state) => sum + getActionWidth(state), 0);
	const protectedGaps = protectedStates.length > 1 ? gapWidth * (protectedStates.length - 1) : 0;
	const overflowTriggerWidth = states.some((state) => state.mode === 'overflow') ? overflowWidth + gapWidth : 0;
	const requiredWidth = protectedWidth + protectedGaps + overflowTriggerWidth;

	if (requiredWidth <= containerWidth) return null;

	return `Toolbar protected actions cannot fit within ${containerWidth}px: ${protectedStates
		.map((state) => `${state.action.id} requires ${getActionWidth(state)}px`)
		.join(', ')}.`;
}

export function computeToolbarActionLayout({
	containerWidth,
	actions,
	overflowWidth,
	gapWidth
}: ComputeToolbarActionLayoutInput): ToolbarActionLayout {
	const states: ToolbarActionState[] = actions.map((action) => ({
		action,
		mode:
			getToolbarActionOverflowPolicy(action) === 'always'
				? 'overflow'
				: getToolbarActionDisplayMode(action) === 'compact' && actionCanCompact(action)
					? 'compact'
					: 'full'
	}));

	if (containerWidth <= 0) {
		for (const state of states) {
			if (getToolbarActionOverflowPolicy(state.action) !== 'never') {
				state.mode = 'overflow';
			} else if (actionCanCompact(state.action)) {
				state.mode = 'compact';
			}
		}
		const warning = buildProtectedWarning(containerWidth, states, overflowWidth, gapWidth);
		return {
			states,
			overflowActions: states.filter((state) => state.mode === 'overflow').map((state) => state.action),
			warnings: warning ? [warning] : []
		};
	}

	for (const state of sortByYieldOrder(states).filter(
		(item) => item.mode !== 'overflow' && actionCanCompact(item.action)
	)) {
		if (getVisibleWidth(states, overflowWidth, gapWidth) <= containerWidth) break;
		state.mode = 'compact';
	}

	for (const state of sortByYieldOrder(states).filter(
		(item) => item.mode !== 'overflow' && getToolbarActionOverflowPolicy(item.action) === 'auto'
	)) {
		if (getVisibleWidth(states, overflowWidth, gapWidth) <= containerWidth) break;
		state.mode = 'overflow';
	}

	const warning = buildProtectedWarning(containerWidth, states, overflowWidth, gapWidth);
	const overflowActions = states.filter((state) => state.mode === 'overflow').map((state) => state.action);

	return {
		states,
		overflowActions,
		warnings: warning ? [warning] : []
	};
}

export function getLayoutModeClass(mode: ToolbarActionLayoutMode): string {
	return `toolbar-action--${mode}`;
}
