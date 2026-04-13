import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTabStore } from './dashboardTabStore.svelte';

vi.mock('$app/environment', () => ({
	browser: true
}));

function deferredResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

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

	it('ignores stale init responses after the active org changes', async () => {
		const orgOneResponse = deferredResponse();
		const orgTwoResponse = deferredResponse();
		global.fetch = vi.fn().mockReturnValueOnce(orgOneResponse.promise).mockReturnValueOnce(orgTwoResponse.promise);
		const store = createDashboardTabStore();

		const orgOneInit = store.init('org-1');
		const orgTwoInit = store.init('org-2');

		orgTwoResponse.resolve(
			new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'training-evals' } }))
		);
		await orgTwoInit;

		orgOneResponse.resolve(
			new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'people-duty' } }))
		);
		await orgOneInit;

		expect(store.activeTab).toBe('training-evals');
		expect(store.defaultTab).toBe('training-evals');
		expect(store.loading).toBe(false);
		expect(store.error).toBeNull();
	});

	it('uses the tab selected at save start after the PUT returns', async () => {
		const saveResponse = deferredResponse();
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'unit-readiness' } }))
			)
			.mockReturnValueOnce(saveResponse.promise);
		const store = createDashboardTabStore();

		await store.init('org-1');
		store.setTab('people-duty');
		const save = store.setDefaultTab('org-1');
		store.setTab('training-evals');

		saveResponse.resolve(
			new Response(JSON.stringify({ config: { version: 3, widgets: [], defaultTab: 'people-duty' } }))
		);
		await save;

		expect(fetch).toHaveBeenLastCalledWith('/org/org-1/api/dashboard-config', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ version: 3, widgets: [], defaultTab: 'people-duty' })
		});
		expect(store.activeTab).toBe('training-evals');
		expect(store.defaultTab).toBe('people-duty');
		expect(store.isDefault).toBe(false);
		expect(store.error).toBeNull();
	});
});
