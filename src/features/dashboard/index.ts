export { DashboardContext } from './contexts/DashboardContext.svelte';
export { default as DashboardPageView } from './components/DashboardPageView.svelte';
export { dashboardTabStore } from './stores/dashboardTabStore.svelte';
export { createDashboardScreenModel, type DashboardScreenModel } from './read-model/dashboardScreenModel.svelte';
export type {
	DashboardPageData,
	TrainingIssue,
	WidgetInstance,
	DashboardConfig,
	DashboardTabId
} from './dashboard.types';
export { DEFAULT_DASHBOARD_CONFIG } from './dashboard.types';
