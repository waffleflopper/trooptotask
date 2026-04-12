import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DASHBOARD_CONFIG,
	filterDashboardWidgets,
	filterQuickStatMetricIds,
	getPermissionAwareDashboardConfig,
	isDefaultDashboardConfig,
	mergeVisibleWidgetOrder,
	type DashboardConfig,
	type DashboardPermissions,
	type WidgetInstance
} from './dashboard.types';

const allPermissions: DashboardPermissions = {
	canViewCalendar: true,
	canViewTraining: true,
	canViewLeadersBook: true,
	canViewOnboarding: true,
	canViewPersonnel: true
};

describe('dashboard permission helpers', () => {
	it('filters widgets by their catalog permissions', () => {
		const widgets: WidgetInstance[] = [
			{ id: 'strength', widgetId: 'strength', config: {} },
			{ id: 'training', widgetId: 'training', config: {} },
			{ id: 'quick', widgetId: 'quick-stats', config: { metrics: ['total-strength'] } }
		];

		const visible = filterDashboardWidgets(widgets, {
			canViewCalendar: true,
			canViewTraining: false,
			canViewPersonnel: true
		});

		expect(visible.map((widget) => widget.id)).toEqual(['strength', 'quick']);
	});

	it('filters quick-stat metrics by metric permissions', () => {
		const metrics = filterQuickStatMetricIds(['present-strength', 'training-currency', 'evaluations-overdue'], {
			canViewCalendar: true,
			canViewTraining: false,
			canViewLeadersBook: false
		});

		expect(metrics).toEqual(['present-strength']);
	});

	it('creates permission-aware default layouts without gated widgets or metrics', () => {
		const config = getPermissionAwareDashboardConfig(DEFAULT_DASHBOARD_CONFIG, {
			canViewCalendar: true,
			canViewTraining: false,
			canViewLeadersBook: false,
			canViewOnboarding: false,
			canViewPersonnel: false
		});

		expect(config.widgets.map((widget) => widget.widgetId)).toEqual([
			'strength',
			'duty',
			'quick-stats',
			'non-available'
		]);
		expect(config.widgets.find((widget) => widget.widgetId === 'quick-stats')?.config.metrics).toEqual([
			'present-strength'
		]);
	});

	it('preserves hidden widgets when reordering the visible subset', () => {
		const widgets: WidgetInstance[] = [
			{ id: 'visible-a', widgetId: 'strength', config: {} },
			{ id: 'hidden', widgetId: 'training', config: {} },
			{ id: 'visible-b', widgetId: 'duty', config: {} }
		];
		const reorderedVisible: WidgetInstance[] = [
			{ id: 'visible-b', widgetId: 'duty', config: {} },
			{ id: 'visible-a', widgetId: 'strength', config: {} }
		];

		const merged = mergeVisibleWidgetOrder(widgets, reorderedVisible, {
			...allPermissions,
			canViewTraining: false
		});

		expect(merged.map((widget) => widget.id)).toEqual(['visible-b', 'hidden', 'visible-a']);
	});

	it('only treats the full starter layout as the default dashboard config', () => {
		expect(isDefaultDashboardConfig(DEFAULT_DASHBOARD_CONFIG)).toBe(true);

		const resizedDefaultWidget: DashboardConfig = {
			...DEFAULT_DASHBOARD_CONFIG,
			widgets: DEFAULT_DASHBOARD_CONFIG.widgets.map((widget, index) =>
				index === 0 ? { ...widget, colSpan: 2 } : widget
			)
		};
		const reconfiguredDefaultWidget: DashboardConfig = {
			...DEFAULT_DASHBOARD_CONFIG,
			widgets: DEFAULT_DASHBOARD_CONFIG.widgets.map((widget) =>
				widget.id === 'default-3' ? { ...widget, config: { ...widget.config, metrics: ['present-strength'] } } : widget
			)
		};

		expect(isDefaultDashboardConfig(resizedDefaultWidget)).toBe(false);
		expect(isDefaultDashboardConfig(reconfiguredDefaultWidget)).toBe(false);
	});
});
