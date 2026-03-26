import type { SmartToolbarItem } from '$lib/components/ui/SmartToolbar.svelte';

const SETTINGS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-1.93 1.46l-.34 1.26a2 2 0 0 1-1.3 1.37l-1.22.42a2 2 0 0 1-1.84-.26l-1.1-.74a2 2 0 0 0-2.57.25l-.31.31a2 2 0 0 0-.25 2.57l.74 1.1a2 2 0 0 1 .26 1.84l-.42 1.22a2 2 0 0 1-1.37 1.3l-1.26.34A2 2 0 0 0 2 11.78v.44a2 2 0 0 0 1.46 1.93l1.26.34a2 2 0 0 1 1.37 1.3l.42 1.22a2 2 0 0 1-.26 1.84l-.74 1.1a2 2 0 0 0 .25 2.57l.31.31a2 2 0 0 0 2.57.25l1.1-.74a2 2 0 0 1 1.84-.26l1.22.42a2 2 0 0 1 1.3 1.37l.34 1.26A2 2 0 0 0 11.78 22h.44a2 2 0 0 0 1.93-1.46l.34-1.26a2 2 0 0 1 1.3-1.37l1.22-.42a2 2 0 0 1 1.84.26l1.1.74a2 2 0 0 0 2.57-.25l.31-.31a2 2 0 0 0 .25-2.57l-.74-1.1a2 2 0 0 1-.26-1.84l.42-1.22a2 2 0 0 1 1.37-1.3l1.26-.34A2 2 0 0 0 22 12.22v-.44a2 2 0 0 0-1.46-1.93l-1.26-.34a2 2 0 0 1-1.37-1.3l-.42-1.22a2 2 0 0 1 .26-1.84l.74-1.1a2 2 0 0 0-.25-2.57l-.31-.31a2 2 0 0 0-2.57-.25l-1.1.74a2 2 0 0 1-1.84.26l-1.22-.42a2 2 0 0 1-1.3-1.37l-.34-1.26A2 2 0 0 0 12.22 2z"/><circle cx="12" cy="12" r="3"/></svg>`;

export interface CalendarToolbarInput {
	orgId: string;
	canEditCalendar: boolean;
	canManageConfig: boolean;
	readOnly: boolean;
	breakdownExpanded: boolean;
	showStatusText: boolean;
	onToggleBreakdown: () => void;
	onToggleStatusText: () => void;
	onExportCSV: () => void;
	onExportPDF: () => void;
}

export function buildCalendarToolbarItems(input: CalendarToolbarInput): SmartToolbarItem[] {
	const items: SmartToolbarItem[] = [];

	items.push({
		type: 'button',
		label: "Today's Summary",
		onclick: input.onToggleBreakdown,
		active: input.breakdownExpanded
	});

	if (input.canEditCalendar && input.canManageConfig) {
		items.push({
			type: 'dropdown',
			label: 'Bulk Status',
			disabled: input.readOnly,
			items: [
				{ label: 'Add Bulk', href: `/org/${input.orgId}/calendar/bulk?tab=add`, disabled: input.readOnly },
				{ label: 'Remove Bulk', href: `/org/${input.orgId}/calendar/bulk?tab=remove`, disabled: input.readOnly },
				{ label: 'Import CSV', href: `/org/${input.orgId}/calendar/bulk?tab=import`, disabled: input.readOnly }
			]
		});

		items.push({
			type: 'dropdown',
			label: 'Planning',
			disabled: input.readOnly,
			items: [
				{ label: 'Duty Roster', href: `/org/${input.orgId}/calendar/duty-roster`, disabled: input.readOnly },
				{ label: 'Assignment Planner', href: `/org/${input.orgId}/calendar/assignments`, disabled: input.readOnly }
			]
		});
	}

	if (input.canManageConfig) {
		items.push({
			type: 'icon-button',
			label: 'Calendar Settings',
			href: `/org/${input.orgId}/calendar/settings`,
			icon: SETTINGS_ICON
		});
	}

	// Overflow items — always available
	items.push(
		{ type: 'overflow', label: 'Export to Excel', onclick: input.onExportCSV },
		{ type: 'overflow', label: 'Print / PDF', onclick: input.onExportPDF },
		{ type: 'overflow', label: 'Show Status Text', onclick: input.onToggleStatusText, active: input.showStatusText }
	);

	return items;
}
