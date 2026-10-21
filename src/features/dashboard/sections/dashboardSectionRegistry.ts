import CalendarIcon from '@lucide/svelte/icons/calendar';
import CheckIcon from '@lucide/svelte/icons/check';
import PlusIcon from '@lucide/svelte/icons/plus';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { dashboardSection, type DashboardSection } from './dashboardSections';

export const DASHBOARD_SECTIONS: readonly DashboardSection[] = [
	dashboardSection('availability', {
		quickAdd: [
			{
				id: 'status',
				label: 'Status',
				icon: CalendarIcon,
				order: 10,
				loadDialog: () => import('../components/quick-add/StatusQuickAdd.svelte'),
				available: (_, access) => access.can(POLICY_ACTION_CATALOG.calendar.manageAvailability)
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
					access.can(POLICY_ACTION_CATALOG.training.recordCompletions)
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
				available: (_, access) => access.can(POLICY_ACTION_CATALOG.onboarding.manageWorkflows)
			}
		]
	})
];
