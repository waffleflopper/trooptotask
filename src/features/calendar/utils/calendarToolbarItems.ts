import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';

export interface CalendarToolbarInput {
	orgId: string;
	orgUrlSegment?: string;
	canManageAvailability: boolean;
	canManageAssignments: boolean;
	canManageConfig: boolean;
	showStatusText: boolean;
	showPersonnelRoles: boolean;
	showOnboardingToggle: boolean;
	highlightOnboarding: boolean;
	dutyStartDayOnly: boolean;
	viewMode?: 'month' | '3-month';
	onToggleStatusText: () => void;
	onTogglePersonnelRoles: () => void;
	onToggleHighlightOnboarding: () => void;
	onToggleDutyStartDayOnly: () => void;
	onExportExcel: () => void;
	onExportPDF: () => void;
}

function overflowToggle(id: string, label: string, active: boolean, onclick: () => void): WorkspaceToolbarAction {
	return {
		id,
		label,
		onclick,
		toggle: true,
		active,
		priority: 'low',
		overflow: 'always'
	};
}

export function buildCalendarToolbarItems(input: CalendarToolbarInput): WorkspaceToolbarAction[] {
	const items: WorkspaceToolbarAction[] = [];
	const orgRouteSegment = input.orgUrlSegment ?? input.orgId;

	if (input.canManageAvailability) {
		items.push({
			id: 'bulk-status',
			label: 'Bulk Status',
			icon: 'clipboard-list',
			displayMode: 'full',
			menuItems: [
				{
					label: 'Add Bulk',
					href: `/org/${orgRouteSegment}/calendar/bulk?tab=add`
				},
				{
					label: 'Remove Bulk',
					href: `/org/${orgRouteSegment}/calendar/bulk?tab=remove`
				},
				{
					label: 'Import CSV',
					href: `/org/${orgRouteSegment}/calendar/bulk?tab=import`
				}
			]
		});
	}

	if (input.canManageAssignments) {
		const planningItems: NonNullable<WorkspaceToolbarAction['menuItems']> = [];
		if (input.canManageConfig) {
			planningItems.push({
				label: 'Duty Rosters (alpha)',
				href: `/org/${orgRouteSegment}/duty-rosters`
			});
		}
		planningItems.push({
			label: 'Assignment Planner',
			href: `/org/${orgRouteSegment}/calendar/assignments`
		});

		items.push({
			id: 'planning',
			label: 'Planning',
			icon: 'calendar-days',
			displayMode: 'full',
			menuItems: planningItems
		});
	}

	items.push({
		id: 'calendar-reports',
		label: 'Reports',
		href: `/org/${orgRouteSegment}/calendar/reports`,
		icon: 'chart',
		displayMode: 'full'
	});

	if (input.canManageConfig) {
		items.push({
			id: 'calendar-settings',
			label: 'Settings',
			href: `/org/${orgRouteSegment}/calendar/settings`,
			icon: 'settings',
			priority: 'low',
			variant: 'secondary'
		});
	}

	if (input.viewMode !== '3-month') {
		items.push(
			{
				id: 'export-excel',
				label: 'Export to Excel',
				onclick: input.onExportExcel,
				priority: 'low',
				overflow: 'always'
			},
			{
				id: 'print-pdf',
				label: 'Print / PDF',
				onclick: input.onExportPDF,
				priority: 'low',
				overflow: 'always'
			}
		);
	}

	if (input.showOnboardingToggle) {
		items.push(
			overflowToggle('show-onboarding', 'Show Onboarding', input.highlightOnboarding, input.onToggleHighlightOnboarding)
		);
	}

	items.push(
		overflowToggle('show-status-text', 'Show Status Text', input.showStatusText, input.onToggleStatusText),
		overflowToggle(
			'show-personnel-roles',
			'Show Personnel Roles',
			input.showPersonnelRoles,
			input.onTogglePersonnelRoles
		),
		overflowToggle(
			'duty-start-day-only',
			'Duty: Start Day Only',
			input.dutyStartDayOnly,
			input.onToggleDutyStartDayOnly
		)
	);

	return items;
}
