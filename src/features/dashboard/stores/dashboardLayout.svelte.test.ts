import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardLayout } from './dashboardLayout.svelte';
import type { DashboardConfig, WidgetInstance } from '../dashboard.types';

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

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return { promise, resolve, reject };
}

describe('dashboardLayout store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		global.fetch = vi.fn(async () => new Response(JSON.stringify({ config: { version: 3, widgets: [] } })));
		const layout = mutableLayout();
		layout._save.cancel();
		layout.orgId = 'org-1';
		dashboardLayout.widgets = [];
		dashboardLayout.loading = false;
		dashboardLayout.error = null;
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

	it('ignores stale init responses after switching organizations', async () => {
		const orgOneResponse = deferred<Response>();
		const orgTwoResponse = deferred<Response>();
		const orgOneConfig: DashboardConfig = {
			version: 3,
			widgets: [{ id: 'org-one-widget', widgetId: 'strength', config: {} }]
		};
		const orgTwoConfig: DashboardConfig = {
			version: 3,
			widgets: [{ id: 'org-two-widget', widgetId: 'duty', config: {} }]
		};

		global.fetch = vi.fn((url) => {
			if (String(url).includes('/org/org-one/')) return orgOneResponse.promise;
			if (String(url).includes('/org/org-two/')) return orgTwoResponse.promise;
			throw new Error(`Unexpected url ${String(url)}`);
		});

		const orgOneInit = dashboardLayout.init('org-one');
		const orgTwoInit = dashboardLayout.init('org-two');

		orgTwoResponse.resolve(new Response(JSON.stringify({ config: orgTwoConfig })));
		await orgTwoInit;

		expect(dashboardLayout.widgets).toEqual(orgTwoConfig.widgets);
		expect(dashboardLayout.loading).toBe(false);

		orgOneResponse.resolve(new Response(JSON.stringify({ config: orgOneConfig })));
		await orgOneInit;

		expect(dashboardLayout.widgets).toEqual(orgTwoConfig.widgets);
		expect(dashboardLayout.loading).toBe(false);
		expect(dashboardLayout.error).toBeNull();
	});
});
