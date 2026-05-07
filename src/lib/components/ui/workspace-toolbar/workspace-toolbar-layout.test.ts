import { describe, expect, it } from 'vitest';
import { getWorkspaceToolbarDensity, partitionWorkspaceToolbarActions } from './workspace-toolbar-layout.js';
import type { WorkspaceToolbarAction } from './types.js';

const actions: WorkspaceToolbarAction[] = [
	{ id: 'low', label: 'Low', priority: 'low' },
	{ id: 'normal', label: 'Normal', priority: 'normal' },
	{ id: 'high', label: 'High', priority: 'high' },
	{ id: 'critical', label: 'Critical', priority: 'critical' },
	{ id: 'never', label: 'Never overflow', overflow: 'never', priority: 'low' },
	{ id: 'always', label: 'Always overflow', overflow: 'always', priority: 'critical' }
];

describe('workspace toolbar layout', () => {
	it('maps available width to toolbar density', () => {
		expect(getWorkspaceToolbarDensity(900)).toBe('comfortable');
		expect(getWorkspaceToolbarDensity(0)).toBe('comfortable');
		expect(getWorkspaceToolbarDensity(700)).toBe('constrained');
		expect(getWorkspaceToolbarDensity(420)).toBe('tight');
	});

	it('keeps every non-forced action visible at comfortable density', () => {
		const result = partitionWorkspaceToolbarActions(actions, 'comfortable');

		expect(result.visibleActions.map((action) => action.id)).toEqual(['low', 'normal', 'high', 'critical', 'never']);
		expect(result.overflowActions.map((action) => action.id)).toEqual(['always']);
	});

	it('moves low and normal priority actions into overflow at constrained density', () => {
		const result = partitionWorkspaceToolbarActions(actions, 'constrained');

		expect(result.visibleActions.map((action) => action.id)).toEqual(['high', 'critical', 'never']);
		expect(result.overflowActions.map((action) => action.id)).toEqual(['low', 'normal', 'always']);
	});

	it('keeps only critical and never-overflow actions visible at tight density', () => {
		const result = partitionWorkspaceToolbarActions(actions, 'tight');

		expect(result.visibleActions.map((action) => action.id)).toEqual(['critical', 'never']);
		expect(result.overflowActions.map((action) => action.id)).toEqual(['low', 'normal', 'high', 'always']);
	});
});
