import CalendarIcon from '@lucide/svelte/icons/calendar';
import CheckIcon from '@lucide/svelte/icons/check';
import PlusIcon from '@lucide/svelte/icons/plus';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { actionablePersonnel, dashboardSection, type DashboardSection } from './dashboardSections';
import { startOnboardingChoices } from './startOnboardingChoices';

const { calendar, training } = POLICY_ACTION_CATALOG;

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', {
		quickAdd: [
			{
				id: 'status',
				label: 'Status',
				icon: CalendarIcon,
				order: 10,
				loadDialog: () => import('../components/quick-add/StatusQuickAdd.svelte'),
				available: (inputs, access) =>
					actionablePersonnel(inputs.personnel, access, calendar.manageAvailability).length > 0
			}
		]
	}),
	dashboardSection('training', {
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
	dashboardSection('evaluations'),
	dashboardSection('lossesAndAwards'),
	dashboardSection('onboarding', {
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
