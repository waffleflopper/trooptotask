import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
import type { DashboardPermission, DashboardPermissions, DashboardTabId } from '../dashboard.types';
import { hasDashboardPermission } from '../dashboard.types';

export interface DashboardTab {
	id: DashboardTabId;
	label: string;
}

interface DashboardQuickAction {
	id: string;
	label: string;
	href: (orgId: string) => string;
	permission?: DashboardPermission;
	icon?: WorkspaceToolbarAction['icon'];
}

export const DASHBOARD_TABS: DashboardTab[] = [
	{ id: 'unit-readiness', label: 'Unit Readiness' },
	{ id: 'people-duty', label: 'People & Duty' },
	{ id: 'training-evals', label: 'Training & Evals' }
];

const quickActions: Record<DashboardTabId, DashboardQuickAction[]> = {
	'unit-readiness': [
		{
			id: 'add-calendar-entry',
			label: 'Add Calendar Entry',
			href: (orgId) => `/org/${orgId}/calendar`,
			permission: 'canViewCalendar',
			icon: 'calendar-days'
		}
	],
	'people-duty': [
		{
			id: 'onboard-soldier',
			label: 'Onboard Soldier',
			href: (orgId) => `/org/${orgId}/onboarding`,
			permission: 'canViewOnboarding',
			icon: 'clipboard-list'
		},
		{
			id: 'duty-roster',
			label: 'Duty Rosters',
			href: (orgId) => `/org/${orgId}/duty-rosters`,
			permission: 'canViewCalendar',
			icon: 'clipboard-check'
		},
		{
			id: 'add-leave',
			label: 'Add Leave',
			href: (orgId) => `/org/${orgId}/calendar`,
			permission: 'canViewCalendar',
			icon: 'calendar-days'
		}
	],
	'training-evals': [
		{
			id: 'record-training',
			label: 'Record Training',
			href: (orgId) => `/org/${orgId}/training`,
			permission: 'canViewTraining',
			icon: 'clipboard-check'
		},
		{
			id: 'add-eval',
			label: 'Add Eval',
			href: (orgId) => `/org/${orgId}/evals`,
			permission: 'canViewRatingScheme',
			icon: 'book-open'
		}
	]
};

export function getDashboardToolbarActions(
	orgId: string,
	permissions: DashboardPermissions,
	activeTab: DashboardTabId
): WorkspaceToolbarAction[] {
	return quickActions[activeTab]
		.filter((action) => hasDashboardPermission(permissions, action.permission))
		.map((action) => ({
			id: action.id,
			label: action.label,
			href: action.href(orgId),
			icon: action.icon,
			priority: 'normal',
			variant: 'secondary'
		}));
}
