export { default as DashboardPageView } from './components/DashboardPageView.svelte';
export {
	createDashboardScreenModel,
	type DashboardScreenModel,
	type DashboardSupportData,
	type DashboardStoreSources
} from './read-model/dashboardScreenModel.svelte';
export type { DashboardPageData } from './contracts';
export { DASHBOARD_SECTIONS } from './sections/dashboardSectionRegistry';

export { dashboardWorkspaceHydrator } from './dashboardWorkspaceHydration.svelte';
