import type {
	ToolbarItem,
	ToolbarMenuToggle,
	ToolbarOption,
	WorkspaceToolbarProps
} from '$lib/components/patterns/workspace-toolbar';

export interface CalendarToolbarInput {
	orgUrlSegment: string;
	canManageAvailability: boolean;
	canManageAssignments: boolean;
	canManageConfig: boolean;
	showEvents: boolean;
	groupOptions: ToolbarOption[];
	groupFilter: string;
	showStatusText: boolean;
	showPersonnelRoles: boolean;
	showOnboardingToggle: boolean;
	highlightOnboarding: boolean;
	onGroupFilterChange: (value: string) => void;
	onToggleStatusText: () => void;
	onTogglePersonnelRoles: () => void;
	onToggleHighlightOnboarding: () => void;
	onExportExcel: () => void;
	onExportPDF: () => void;
}

export function buildCalendarToolbar(input: CalendarToolbarInput): {
	items: ToolbarItem[];
	primary: WorkspaceToolbarProps['primary'];
} {
	const calendarHref = `/org/${input.orgUrlSegment}/calendar`;
	const displayOptions: ToolbarMenuToggle[] = [
		...(input.showOnboardingToggle
			? [
					{
						kind: 'toggle',
						id: 'show-onboarding',
						label: 'Show Onboarding',
						pressed: input.highlightOnboarding,
						onPressedChange: input.onToggleHighlightOnboarding
					} satisfies ToolbarMenuToggle
				]
			: []),
		{
			kind: 'toggle',
			id: 'show-status-text',
			label: 'Show Status Text',
			pressed: input.showStatusText,
			onPressedChange: input.onToggleStatusText
		},
		{
			kind: 'toggle',
			id: 'show-personnel-roles',
			label: 'Show Personnel Roles',
			pressed: input.showPersonnelRoles,
			onPressedChange: input.onTogglePersonnelRoles
		}
	];

	const items: ToolbarItem[] = [
		{
			kind: 'select',
			id: 'group',
			label: 'Group',
			ariaLabel: 'Calendar group filter',
			options: input.groupOptions,
			value: input.groupFilter,
			defaultValue: '',
			onValueChange: input.onGroupFilterChange
		},
		{ kind: 'action', id: 'calendar-display', label: 'Display', icon: 'sliders', menuItems: displayOptions },
		{ kind: 'action', id: 'calendar-reports', label: 'Reports', icon: 'chart', href: `${calendarHref}/reports` }
	];

	if (input.showEvents) {
		items.push({
			kind: 'action',
			id: 'calendar-events',
			label: 'Events & Taskings',
			icon: 'clipboard-check',
			href: `${calendarHref}/events`
		});
	}

	if (input.canManageAssignments) {
		items.push({
			kind: 'action',
			id: 'duty-planner',
			label: 'Duty planner',
			icon: 'calendar-days',
			href: `${calendarHref}/assignments`
		});
	}
	if (input.canManageConfig) {
		items.push({
			kind: 'action',
			id: 'calendar-settings',
			label: 'Settings',
			icon: 'settings',
			menuOnly: true,
			href: `${calendarHref}/settings`
		});
	}
	items.push(
		{ kind: 'action', id: 'export-excel', label: 'Export to Excel', menuOnly: true, onclick: input.onExportExcel },
		{ kind: 'action', id: 'print-pdf', label: 'Print / PDF', menuOnly: true, onclick: input.onExportPDF }
	);

	const primary: WorkspaceToolbarProps['primary'] = input.canManageAvailability
		? {
				kind: 'action',
				id: 'bulk-status',
				label: 'Bulk Status',
				icon: 'clipboard-list',
				menuItems: [
					{ kind: 'action', id: 'bulk-add', label: 'Add Bulk', href: `${calendarHref}/bulk?tab=add` },
					{ kind: 'action', id: 'bulk-remove', label: 'Remove Bulk', href: `${calendarHref}/bulk?tab=remove` },
					{ kind: 'action', id: 'bulk-import', label: 'Import CSV', href: `${calendarHref}/import` }
				]
			}
		: undefined;

	return { items, primary };
}
