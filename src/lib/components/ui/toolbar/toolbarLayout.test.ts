import { describe, expect, it } from 'vitest';
import { computeToolbarActionLayout } from './toolbarLayout';
import type { MeasuredToolbarAction } from './toolbar.types';

function action(overrides: Partial<MeasuredToolbarAction> & Pick<MeasuredToolbarAction, 'id'>): MeasuredToolbarAction {
	return {
		id: overrides.id,
		label: overrides.label ?? overrides.id,
		priority: overrides.priority ?? 'normal',
		displayMode: overrides.displayMode ?? 'auto',
		overflow: overrides.overflow ?? 'auto',
		variant: overrides.variant ?? 'default',
		icon: overrides.icon,
		fullWidth: overrides.fullWidth ?? 112,
		compactWidth: overrides.compactWidth ?? 40
	};
}

describe('computeToolbarActionLayout', () => {
	it('keeps every action full size when the full action set fits', () => {
		const layout = computeToolbarActionLayout({
			containerWidth: 360,
			overflowWidth: 40,
			gapWidth: 8,
			actions: [
				action({ id: 'export', fullWidth: 90 }),
				action({ id: 'reports', fullWidth: 94 }),
				action({ id: 'record', fullWidth: 118, priority: 'critical', overflow: 'never' })
			]
		});

		expect(layout.states.map((state) => [state.action.id, state.mode])).toEqual([
			['export', 'full'],
			['reports', 'full'],
			['record', 'full']
		]);
		expect(layout.warnings).toEqual([]);
	});

	it('compacts icon-capable actions by priority before moving actions into overflow', () => {
		const layout = computeToolbarActionLayout({
			containerWidth: 190,
			overflowWidth: 40,
			gapWidth: 8,
			actions: [
				action({ id: 'export', priority: 'low', icon: 'download', fullWidth: 96, compactWidth: 70 }),
				action({ id: 'import', priority: 'normal', icon: 'upload', fullWidth: 142, compactWidth: 40 }),
				action({ id: 'reports', priority: 'high', icon: 'chart', fullWidth: 96, compactWidth: 40 }),
				action({
					id: 'record',
					priority: 'critical',
					icon: 'clipboard-check',
					variant: 'primary',
					overflow: 'never',
					fullWidth: 136,
					compactWidth: 40
				})
			]
		});

		expect(layout.states.map((state) => [state.action.id, state.mode])).toEqual([
			['export', 'overflow'],
			['import', 'compact'],
			['reports', 'compact'],
			['record', 'compact']
		]);
	});

	it('preserves author order inside generated overflow items', () => {
		const layout = computeToolbarActionLayout({
			containerWidth: 88,
			overflowWidth: 40,
			gapWidth: 8,
			actions: [
				action({ id: 'export', priority: 'low', icon: 'download' }),
				action({ id: 'import', priority: 'low', icon: 'upload' }),
				action({ id: 'library', priority: 'normal', icon: 'book-open' }),
				action({ id: 'record', priority: 'critical', icon: 'clipboard-check', overflow: 'never' })
			]
		});

		expect(layout.overflowActions.map((item) => item.id)).toEqual(['export', 'import', 'library']);
	});

	it('reports an impossible protected layout instead of overflowing protected actions', () => {
		const layout = computeToolbarActionLayout({
			containerWidth: 72,
			overflowWidth: 40,
			gapWidth: 8,
			actions: [
				action({
					id: 'record',
					priority: 'critical',
					icon: 'clipboard-check',
					overflow: 'never',
					fullWidth: 140,
					compactWidth: 92
				})
			]
		});

		expect(layout.states).toEqual([
			expect.objectContaining({ action: expect.objectContaining({ id: 'record' }), mode: 'compact' })
		]);
		expect(layout.warnings).toEqual(['Toolbar protected actions cannot fit within 72px: record requires 92px.']);
	});
});
