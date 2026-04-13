import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTabStore } from './dashboardTabStore.svelte';

vi.mock('$app/environment', () => ({
	browser: true
}));

describe('dashboardTabStore', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('loads the default tab from the dashboard-config response wrapper', async () => {
		global.fetch = vi.fn(
			async () => new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'people-duty' } }))
		);
		const store = createDashboardTabStore();

		await store.init('org-1');

		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/dashboard-config');
		expect(store.activeTab).toBe('people-duty');
		expect(store.defaultTab).toBe('people-duty');
		expect(store.error).toBeNull();
	});

	it('preserves existing config fields when saving a new default tab', async () => {
		const savedConfig = {
			version: 3,
			widgets: [{ id: 'legacy-widget', widgetId: 'strength', config: { showGroupBreakdown: true } }],
			defaultTab: 'unit-readiness'
		};
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ config: savedConfig })))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ config: { ...savedConfig, defaultTab: 'training-evals' } }))
			);
		const store = createDashboardTabStore();

		await store.init('org-1');
		store.setTab('training-evals');
		await store.setDefaultTab('org-1');

		expect(fetch).toHaveBeenLastCalledWith('/org/org-1/api/dashboard-config', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...savedConfig, defaultTab: 'training-evals' })
		});
		expect(store.defaultTab).toBe('training-evals');
		expect(store.error).toBeNull();
	});

	it('does not update the saved default tab when persistence fails', async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'unit-readiness' } }))
			)
			.mockResolvedValueOnce(new Response('nope', { status: 500 }));
		const store = createDashboardTabStore();

		await store.init('org-1');
		store.setTab('people-duty');
		await store.setDefaultTab('org-1');

		expect(store.activeTab).toBe('people-duty');
		expect(store.defaultTab).toBe('unit-readiness');
		expect(store.error).toBe('Failed to save dashboard tab preference');
	});
});
