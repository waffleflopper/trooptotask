import type { ToolbarAction, ToolbarItem, ToolbarOption } from '$lib/components/patterns/workspace-toolbar';

export type CalendarViewMode = 'month' | '3-month';

export interface CalendarToolbarInput {
	orgUrlSegment: string;
	canManageAvailability: boolean;
	canManageAssignments: boolean;
	canManageConfig: boolean;
	viewMode: CalendarViewMode;
	groupOptions: ToolbarOption[];
	groupFilter: string;
	showStatusText: boolean;
	showPersonnelRoles: boolean;
	showOnboardingToggle: boolean;
	highlightOnboarding: boolean;
	onViewModeChange: (mode: CalendarViewMode) => void;
	onGroupFilterChange: (value: string) => void;
	onToggleStatusText: () => void;
	onTogglePersonnelRoles: () => void;
	onToggleHighlightOnboarding: () => void;
	onExportExcel: () => void;
	onExportPDF: () => void;
}

const viewOptions: ToolbarOption[] = [
	{ value: 'month', label: 'Month' },
	{ value: '3-month', label: '3-Month' }
];

export function buildCalendarToolbar(input: CalendarToolbarInput): { items: ToolbarItem[]; primary?: ToolbarAction } {
	const calendarHref = `/org/${input.orgUrlSegment}/calendar`;
	const items: ToolbarItem[] = [
		{
			kind: 'view',
			id: 'calendar-view',
			label: 'Calendar view',
			options: viewOptions,
			value: input.viewMode,
			onValueChange: (value) => {
				if (value === 'month' || value === '3-month') input.onViewModeChange(value);
			}
		},
		{
			kind: 'select',
			id: 'group',
			label: 'Group',
			ariaLabel: 'Calendar group filter',
			options: input.groupOptions,
			value: input.groupFilter,
			defaultValue: '',
			onValueChange: input.onGroupFilterChange
		}
	];

	if (input.showOnboardingToggle) {
		items.push({
			kind: 'toggle',
			id: 'show-onboarding',
			label: 'Show Onboarding',
			menuOnly: true,
			defaultPressed: true,
			pressed: input.highlightOnboarding,
			onPressedChange: input.onToggleHighlightOnboarding
		});
	}
	items.push(
		{
			kind: 'toggle',
			id: 'show-status-text',
			label: 'Show Status Text',
			menuOnly: true,
			pressed: input.showStatusText,
			onPressedChange: input.onToggleStatusText
		},
		{
			kind: 'toggle',
			id: 'show-personnel-roles',
			label: 'Show Personnel Roles',
			menuOnly: true,
			pressed: input.showPersonnelRoles,
			onPressedChange: input.onTogglePersonnelRoles
		}
	);

	if (input.canManageAssignments) {
		items.push({
			kind: 'action',
			id: 'planning',
			label: 'Planning',
			icon: 'calendar-days',
			menuItems: [
				{ kind: 'action', id: 'assignment-planner', label: 'Assignment Planner', href: `${calendarHref}/assignments` }
			]
		});
	}
	items.push({
		kind: 'action',
		id: 'calendar-reports',
		label: 'Reports',
		icon: 'chart',
		href: `${calendarHref}/reports`
	});
	if (input.canManageConfig) {
		items.push({
			kind: 'action',
			id: 'calendar-settings',
			label: 'Settings',
			icon: 'settings',
			href: `${calendarHref}/settings`
		});
	}
	items.push(
		{ kind: 'action', id: 'export-excel', label: 'Export to Excel', menuOnly: true, onclick: input.onExportExcel },
		{ kind: 'action', id: 'print-pdf', label: 'Print / PDF', menuOnly: true, onclick: input.onExportPDF }
	);

	const primary: ToolbarAction | undefined = input.canManageAvailability
		? {
				kind: 'action',
				id: 'bulk-status',
				label: 'Bulk Status',
				icon: 'clipboard-list',
				menuItems: [
					{ kind: 'action', id: 'bulk-add', label: 'Add Bulk', href: `${calendarHref}/bulk?tab=add` },
					{ kind: 'action', id: 'bulk-remove', label: 'Remove Bulk', href: `${calendarHref}/bulk?tab=remove` },
					{ kind: 'action', id: 'bulk-import', label: 'Import CSV', href: `${calendarHref}/bulk?tab=import` }
				]
			}
		: undefined;

	return { items, primary };
}
