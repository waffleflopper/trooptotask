import CalendarIcon from '@lucide/svelte/icons/calendar';
import CheckIcon from '@lucide/svelte/icons/check';
import PlusIcon from '@lucide/svelte/icons/plus';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import ComingAndGoing from '../components/ComingAndGoing.svelte';
import TonightAndTomorrow from '../components/TonightAndTomorrow.svelte';
import { dashboardSection, type DashboardSection } from './dashboardSections';
import { actionablePersonnel, personnelResource, seesCalendar } from './dashboardAccess';
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
import { criticalTasksSetup, evaluationsSetup, onboardingSetup, trainingSetup } from './setupChecks';
import { startOnboardingChoices } from './startOnboardingChoices';
import { taskingAttention, taskingAttentionLoad } from './taskingAttention';

const { calendar, training } = POLICY_ACTION_CATALOG;

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', {
		available: (_, access) => seesCalendar(access),
		needsYou: [unfilledDuty],
		onDuty: [
			{ id: 'tonight-and-tomorrow', order: 10, component: TonightAndTomorrow },
			{ id: 'coming-and-going', order: 30, component: ComingAndGoing }
		],
		quickAdd: [
			{
				id: 'status',
				label: 'Status',
				icon: CalendarIcon,
				order: 10,
				loadDialog: () => import('../components/quick-add/StatusQuickAdd.svelte'),
				available: (inputs, access) =>
					inputs.statusTypes.length > 0 &&
					actionablePersonnel(inputs.personnel, access, calendar.manageAvailability).length > 0
			}
		]
	}),
	dashboardSection('training', {
		setup: trainingSetup,
		needsYou: [expiredTraining],
		readiness: trainingReadiness,
		quickAdd: [
			{
				id: 'training-record',
				label: 'Training record',
				icon: CheckIcon,
				order: 20,
				loadDialog: () => import('../components/quick-add/TrainingRecordQuickAdd.svelte'),
				available: (inputs, access) =>
					inputs.personnel.some(
						(person) =>
							access.can(training.recordCompletions, personnelResource(person)) &&
							inputs.page.dashboard.data.trainingTypes.some(
								(type) => !type.canBeExempted || !type.exemptPersonnelIds.includes(person.id)
							)
					)
			}
		]
	}),
	dashboardSection('criticalTasks', { setup: criticalTasksSetup, readiness: criticalTasksReadiness }),
	dashboardSection('evaluations', {
		setup: evaluationsSetup,
		needsYou: [overdueEvaluations],
		readiness: evaluationsReadiness
	}),
	dashboardSection('lossesAndAwards', { needsYou: [leavingWithoutAward], readiness: arrivingAndLeavingReadiness }),
	dashboardSection('onboarding', {
		setup: onboardingSetup,
		needsYou: [stalledOnboarding],
		quickAdd: [
			{
				id: 'start-onboarding',
				label: 'Start onboarding',
				icon: PlusIcon,
				order: 30,
				primary: true,
				loadDialog: () => import('../components/quick-add/StartOnboardingQuickAdd.svelte'),
				available: (inputs, access) => startOnboardingChoices(inputs, access).usable
			}
		]
	}),
	dashboardSection('eventsAndTaskings', {
		available: (_, access) => access.can(calendar.viewEvents),
		needsYou: [taskingAttention],
		needsYouLoad: taskingAttentionLoad
	})
];
