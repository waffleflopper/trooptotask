import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardLayout } from './dashboardLayout.svelte';
import type { WidgetInstance } from '../dashboard.types';

vi.mock('$app/environment', () => ({
	browser: true
}));

type DashboardLayoutInternals = {
	orgId: string | null;
	_save: { cancel: () => void };
};

function mutableLayout(): DashboardLayoutInternals {
	return dashboardLayout as unknown as DashboardLayoutInternals;
}

describe('dashboardLayout store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		global.fetch = vi.fn(async () => new Response(JSON.stringify({ config: { version: 3, widgets: [] } })));
		const layout = mutableLayout();
		layout._save.cancel();
		layout.orgId = 'org-1';
		dashboardLayout.widgets = [];
		dashboardLayout.isFirstRun = false;
		dashboardLayout.firstRunDismissed = false;
	});

	afterEach(() => {
		mutableLayout()._save.cancel();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('snapshots org and widgets when scheduling a debounced save', async () => {
		const originalWidgets: WidgetInstance[] = [{ id: 'a', widgetId: 'strength', config: {} }];
		const laterWidgets: WidgetInstance[] = [{ id: 'b', widgetId: 'training', config: {} }];

		dashboardLayout.setWidgets(originalWidgets);
		mutableLayout().orgId = 'org-2';
		dashboardLayout.widgets = laterWidgets;

		await vi.advanceTimersByTimeAsync(800);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('/org/org-1/api/dashboard-config');
		expect(JSON.parse(String(init?.body))).toEqual({ version: 3, widgets: originalWidgets });
	});

	it('resets first-run state when resetting to the permission-aware default', () => {
		dashboardLayout.firstRunDismissed = true;

		dashboardLayout.resetToDefault({
			canViewCalendar: true,
			canViewTraining: false,
			canViewLeadersBook: false,
			canViewOnboarding: false,
			canViewPersonnel: false
		});

		expect(dashboardLayout.isFirstRun).toBe(true);
		expect(dashboardLayout.firstRunDismissed).toBe(false);
		expect(dashboardLayout.widgets.map((widget) => widget.widgetId)).toEqual([
			'strength',
			'duty',
			'quick-stats',
			'non-available'
		]);
	});
});
