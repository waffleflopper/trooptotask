import type { ToolbarActionConfig } from '$lib/components/ui/toolbar';

export interface CalendarToolbarInput {
	orgId: string;
	canManageAvailability: boolean;
	canManageAssignments: boolean;
	canManageConfig: boolean;
	readOnly: boolean;
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
	onExportCSV: () => void;
	onExportPDF: () => void;
}

function overflowToggle(id: string, label: string, active: boolean, onclick: () => void): ToolbarActionConfig {
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

export function buildCalendarToolbarItems(input: CalendarToolbarInput): ToolbarActionConfig[] {
	const items: ToolbarActionConfig[] = [];
	const readOnlyReason = input.readOnly ? 'Read-only mode' : undefined;

	if (input.canManageAvailability) {
		items.push({
			id: 'bulk-status',
			label: 'Bulk Status',
			icon: 'clipboard-list',
			displayMode: 'full',
			disabled: input.readOnly,
			disabledReason: readOnlyReason,
			menuItems: [
				{
					label: 'Add Bulk',
					href: `/org/${input.orgId}/calendar/bulk?tab=add`,
					disabled: input.readOnly,
					disabledReason: readOnlyReason
				},
				{
					label: 'Remove Bulk',
					href: `/org/${input.orgId}/calendar/bulk?tab=remove`,
					disabled: input.readOnly,
					disabledReason: readOnlyReason
				},
				{
					label: 'Import CSV',
					href: `/org/${input.orgId}/calendar/bulk?tab=import`,
					disabled: input.readOnly,
					disabledReason: readOnlyReason
				}
			]
		});
	}

	if (input.canManageAssignments) {
		const planningItems: NonNullable<ToolbarActionConfig['menuItems']> = [];
		if (input.canManageConfig) {
			planningItems.push({
				label: 'Duty Rosters',
				href: `/org/${input.orgId}/duty-rosters`,
				disabled: input.readOnly,
				disabledReason: readOnlyReason
			});
		}
		planningItems.push({
			label: 'Assignment Planner',
			href: `/org/${input.orgId}/calendar/assignments`,
			disabled: input.readOnly,
			disabledReason: readOnlyReason
		});

		items.push({
			id: 'planning',
			label: 'Planning',
			icon: 'calendar-days',
			displayMode: 'full',
			disabled: input.readOnly,
			disabledReason: readOnlyReason,
			menuItems: planningItems
		});
	}

	if (input.canManageConfig) {
		items.push({
			id: 'calendar-settings',
			label: 'Settings',
			href: `/org/${input.orgId}/calendar/settings`,
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
				onclick: input.onExportCSV,
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
