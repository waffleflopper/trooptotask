import { browser } from '$app/environment';
import type { DashboardTabId, DashboardConfig } from '../dashboard.types';

const ALL_TABS: DashboardTabId[] = ['unit-readiness', 'people-duty', 'training-evals'];

function createDashboardTabStore() {
	let activeTab = $state<DashboardTabId>('unit-readiness');
	let defaultTab = $state<DashboardTabId>('unit-readiness');
	let cachedConfig = $state<DashboardConfig | null>(null);
	let loading = $state(true);
	let saving = $state(false);

	async function init(orgId: string) {
		if (!browser) return;
		loading = true;
		try {
			const res = await fetch(`/org/${orgId}/api/dashboard-config`);
			if (res.ok) {
				const config: DashboardConfig = await res.json();
				cachedConfig = config;
				const tab = config.defaultTab ?? 'unit-readiness';
				const resolved: DashboardTabId = ALL_TABS.includes(tab) ? tab : 'unit-readiness';
				activeTab = resolved;
				defaultTab = resolved;
			}
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
		try {
			await fetch(`/org/${orgId}/api/dashboard-config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...cachedConfig, defaultTab: activeTab })
			});
			defaultTab = activeTab;
			cachedConfig = { ...cachedConfig, defaultTab: activeTab };
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
		get isDefault() {
			return activeTab === defaultTab;
		},
		init,
		setTab,
		setDefaultTab
	};
}

export const dashboardTabStore = createDashboardTabStore();
