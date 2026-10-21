import { dashboardSection, type DashboardSection } from './dashboardSections';

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability'),
	dashboardSection('training'),
	dashboardSection('criticalTasks'),
	dashboardSection('evaluations'),
	dashboardSection('lossesAndAwards'),
	dashboardSection('onboarding')
];
