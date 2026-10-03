export { default as DashboardLoadError } from './components/DashboardLoadError.svelte';
export { default as DashboardPageView } from './components/DashboardPageView.svelte';
export {
	createDashboardScreenModel,
	type DashboardScreenModel,
	type DashboardSupportData,
	type DashboardStoreSources
} from './read-model/dashboardScreenModel.svelte';
export type { DashboardPageData, TrainingIssue } from './contracts';

export { dashboardWorkspaceHydrator } from './dashboardWorkspaceHydration.svelte';
