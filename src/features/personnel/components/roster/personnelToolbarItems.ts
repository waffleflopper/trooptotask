import type { ToolbarItem, ToolbarMenuToggle } from '$lib/components/patterns/workspace-toolbar';

export type RosterViewMode = 'alphabetical' | 'by-group';

const ROSTER_VIEW_OPTIONS = [
	{ value: 'alphabetical', label: 'A-Z' },
	{ value: 'by-group', label: 'Group' }
];

export interface PersonnelToolbarInput {
	/** Null when the roster has one way to read it, so there is no choice to offer. */
	viewMode: RosterViewMode | null;
	onViewModeChange: (mode: RosterViewMode) => void;
	/** Null when no visible Group has sub-groups. */
	showSubGroups: ToolbarMenuToggle | null;
	onManageGroups: (() => void) | null;
	importHref: string | null;
}

export function personnelToolbarItems(input: PersonnelToolbarInput): ToolbarItem[] {
	const items: ToolbarItem[] = [];
	if (input.viewMode) {
		items.push({
			kind: 'view',
			id: 'roster-view',
			label: 'Roster sort mode',
			options: ROSTER_VIEW_OPTIONS,
			value: input.viewMode,
			onValueChange: (value) => {
				if (value === 'alphabetical' || value === 'by-group') input.onViewModeChange(value);
			}
		});
	}
	if (input.showSubGroups) {
		items.push({
			kind: 'action',
			id: 'roster-display',
			label: 'Display',
			icon: 'sliders',
			menuItems: [input.showSubGroups]
		});
	}
	if (input.onManageGroups) {
		items.push({ kind: 'action', id: 'manage-groups', label: 'Manage Groups', onclick: input.onManageGroups });
	}
	if (input.importHref) {
		items.push({ kind: 'action', id: 'import', label: 'Import', icon: 'download', href: input.importHref });
	}
	return items;
}
