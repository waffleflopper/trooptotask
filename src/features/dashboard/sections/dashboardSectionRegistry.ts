import { dashboardSection, type DashboardSection } from './dashboardSections';

/** Page order: readiness columns and quick-add buttons follow this list. */
export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability'),
	dashboardSection('training'),
	dashboardSection('criticalTasks'),
	dashboardSection('evaluations'),
	dashboardSection('lossesAndAwards'),
	dashboardSection('onboarding')
];
