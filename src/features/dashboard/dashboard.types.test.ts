import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DASHBOARD_CONFIG,
	hasDashboardPermission,
	normalizeDashboardConfig,
	resolveDashboardTab
} from './dashboard.types';

describe('dashboard config helpers', () => {
	it('checks dashboard permissions defensively', () => {
		expect(hasDashboardPermission({ canViewCalendar: true }, 'canViewCalendar')).toBe(true);
		expect(hasDashboardPermission({ canViewCalendar: false }, 'canViewCalendar')).toBe(false);
		expect(hasDashboardPermission(null, 'canViewCalendar')).toBe(false);
		expect(hasDashboardPermission(undefined)).toBe(true);
	});

	it('falls back to the unit readiness tab for unknown persisted tab values', () => {
		expect(resolveDashboardTab('people-duty')).toBe('people-duty');
		expect(resolveDashboardTab('legacy-widget-grid')).toBe('unit-readiness');
		expect(resolveDashboardTab(null)).toBe('unit-readiness');
	});

	it('normalizes persisted dashboard config while preserving legacy widget data', () => {
		const legacyWidget = { id: 'legacy-1', widgetId: 'strength', config: { showGroupBreakdown: true } };

		expect(
			normalizeDashboardConfig({
				version: 3,
				widgets: [legacyWidget],
				defaultTab: 'training-evals'
			})
		).toEqual({
			version: 3,
			widgets: [legacyWidget],
			defaultTab: 'training-evals'
		});
	});

	it('provides an empty compatibility widget list by default', () => {
		expect(DEFAULT_DASHBOARD_CONFIG).toEqual({
			version: 3,
			widgets: []
		});
		expect(normalizeDashboardConfig({})).toEqual({
			version: 3,
			widgets: [],
			defaultTab: 'unit-readiness'
		});
	});
});
