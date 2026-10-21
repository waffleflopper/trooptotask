import { dashboardSection, type DashboardSection } from './dashboardSections';
import {
	expiredTraining,
	leavingWithoutAward,
	overdueEvaluations,
	stalledOnboarding,
	unfilledDuty
} from './needsYouSources';

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', { needsYou: [unfilledDuty] }),
	dashboardSection('training', { needsYou: [expiredTraining] }),
	dashboardSection('criticalTasks'),
	dashboardSection('evaluations', { needsYou: [overdueEvaluations] }),
	dashboardSection('lossesAndAwards', { needsYou: [leavingWithoutAward] }),
	dashboardSection('onboarding', { needsYou: [stalledOnboarding] })
];
