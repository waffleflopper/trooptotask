export { default as DashboardPageView } from './components/DashboardPageView.svelte';
export {
	createDashboardScreenModel,
	type DashboardScreenModel,
	type DashboardSupportData,
	type DashboardStoreSources
} from './read-model/dashboardScreenModel.svelte';
export type { DashboardPageData } from './contracts';
export {
	overlayDashboardRecords,
	overlayDashboardSummary,
	putDashboardRecord,
	type DashboardPageUpdates,
	type DashboardRecordChange,
	type DashboardRecordOverlay
} from './dashboardPageUpdates';
export { DASHBOARD_SECTIONS } from './sections/dashboardSectionRegistry';
export { createDashboardAccess, type DashboardAccess } from './sections/dashboardAccess';

export { dashboardWorkspaceHydrator } from './dashboardWorkspaceHydration.svelte';
