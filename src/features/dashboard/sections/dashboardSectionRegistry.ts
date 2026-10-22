import ComingAndGoing from '../components/ComingAndGoing.svelte';
import TonightAndTomorrow from '../components/TonightAndTomorrow.svelte';
import { dashboardSection, type DashboardSection } from './dashboardSections';
import {
	expiredTraining,
	leavingWithoutAward,
	overdueEvaluations,
	stalledOnboarding,
	unfilledDuty
} from './needsYouSources';
import {
	arrivingAndLeavingReadiness,
	criticalTasksReadiness,
	evaluationsReadiness,
	trainingReadiness
} from './readiness';

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', {
		needsYou: [unfilledDuty],
		onDuty: [
			{ id: 'tonight-and-tomorrow', order: 10, component: TonightAndTomorrow },
			{ id: 'coming-and-going', order: 30, component: ComingAndGoing }
		]
	}),
	dashboardSection('training', { needsYou: [expiredTraining], readiness: trainingReadiness }),
	dashboardSection('criticalTasks', { readiness: criticalTasksReadiness }),
	dashboardSection('evaluations', { needsYou: [overdueEvaluations], readiness: evaluationsReadiness }),
	dashboardSection('lossesAndAwards', { needsYou: [leavingWithoutAward], readiness: arrivingAndLeavingReadiness }),
	dashboardSection('onboarding', { needsYou: [stalledOnboarding] })
];
