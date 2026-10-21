import CalendarIcon from '@lucide/svelte/icons/calendar';
import CheckIcon from '@lucide/svelte/icons/check';
import PlusIcon from '@lucide/svelte/icons/plus';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import ComingAndGoing from '../components/ComingAndGoing.svelte';
import TonightAndTomorrow from '../components/TonightAndTomorrow.svelte';
import { dashboardSection, type DashboardSection } from './dashboardSections';
import { actionablePersonnel } from './dashboardAccess';
import {
	expiredTraining,
	leavingWithoutAward,
	overdueEvaluations,
	stalledOnboarding,
	unfilledDuty
} from './needsYouSources';
import { startOnboardingChoices } from './startOnboardingChoices';

const { calendar, training } = POLICY_ACTION_CATALOG;

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', {
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
		needsYou: [expiredTraining],
		quickAdd: [
			{
				id: 'training-record',
				label: 'Training record',
				icon: CheckIcon,
				order: 20,
				loadDialog: () => import('../components/quick-add/TrainingRecordQuickAdd.svelte'),
				available: (inputs, access) =>
					inputs.page.dashboard.data.trainingTypes.length > 0 &&
					actionablePersonnel(inputs.personnel, access, training.recordCompletions).length > 0
			}
		]
	}),
	dashboardSection('criticalTasks'),
	dashboardSection('evaluations', { needsYou: [overdueEvaluations] }),
	dashboardSection('lossesAndAwards', { needsYou: [leavingWithoutAward] }),
	dashboardSection('onboarding', {
		needsYou: [stalledOnboarding],
		quickAdd: [
			{
				id: 'start-onboarding',
				label: 'Start onboarding',
				icon: PlusIcon,
				order: 30,
				loadDialog: () => import('../components/quick-add/StartOnboardingQuickAdd.svelte'),
				available: (inputs, access) => startOnboardingChoices(inputs, access).usable
			}
		]
	})
];
