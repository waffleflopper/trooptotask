import { browser } from '$app/environment';
import {
	normalizeDashboardConfig,
	resolveDashboardTab,
	type DashboardTabId,
	type DashboardConfig
} from '../dashboard.types';

const ALL_TABS: DashboardTabId[] = ['unit-readiness', 'people-duty', 'training-evals'];

interface DashboardConfigResponse {
	config: DashboardConfig;
}

function unwrapDashboardConfigResponse(value: unknown): DashboardConfig {
	const response = value as Partial<DashboardConfigResponse> | null | undefined;
	const config = response?.config;
	if (config && typeof config === 'object' && 'config' in config) {
		return normalizeDashboardConfig((config as unknown as { config: unknown }).config);
	}

	return normalizeDashboardConfig(config);
}

function createDashboardTabStore() {
	let activeTab = $state<DashboardTabId>('unit-readiness');
	let defaultTab = $state<DashboardTabId>('unit-readiness');
	let cachedConfig = $state<DashboardConfig | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state<string | null>(null);

	async function init(orgId: string) {
		if (!browser) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(`/org/${orgId}/api/dashboard-config`);
			if (!res.ok) {
				throw new Error('Failed to load dashboard tab preference');
			}

			const config = unwrapDashboardConfigResponse(await res.json());
			cachedConfig = config;
			const tab = resolveDashboardTab(config.defaultTab);
			const resolved: DashboardTabId = ALL_TABS.includes(tab) ? tab : 'unit-readiness';
			activeTab = resolved;
			defaultTab = resolved;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load dashboard tab preference';
		} finally {
			loading = false;
		}
	}

	function setTab(tab: DashboardTabId) {
		activeTab = tab;
	}

	async function setDefaultTab(orgId: string) {
		if (!cachedConfig || saving) return;
		saving = true;
		error = null;
		try {
			const response = await fetch(`/org/${orgId}/api/dashboard-config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...cachedConfig, defaultTab: activeTab })
			});

			if (!response.ok) {
				throw new Error('Failed to save dashboard tab preference');
			}

			defaultTab = activeTab;
			cachedConfig = { ...cachedConfig, defaultTab: activeTab };
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : 'Failed to save dashboard tab preference';
		} finally {
			saving = false;
		}
	}

	return {
		get activeTab() {
			return activeTab;
		},
		get defaultTab() {
			return defaultTab;
		},
		get loading() {
			return loading;
		},
		get saving() {
			return saving;
		},
		get error() {
			return error;
		},
		get isDefault() {
			return activeTab === defaultTab;
		},
		init,
		setTab,
		setDefaultTab
	};
}

export { createDashboardTabStore };
export const dashboardTabStore = createDashboardTabStore();
