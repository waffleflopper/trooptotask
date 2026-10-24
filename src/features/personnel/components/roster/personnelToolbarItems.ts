import type { ToolbarItem } from '$lib/components/patterns/workspace-toolbar';

export type RosterViewMode = 'alphabetical' | 'by-group';

const ROSTER_VIEW_OPTIONS = [
	{ value: 'alphabetical', label: 'A-Z' },
	{ value: 'by-group', label: 'Group' }
];

export interface PersonnelToolbarInput {
	viewMode: RosterViewMode;
	onViewModeChange: (mode: RosterViewMode) => void;
	/** Null hides Manage Groups. */
	onManageGroups: (() => void) | null;
	/** Null hides Import. */
	importHref: string | null;
}

/** The roster toolbar's items in rank order: the view toggle, then Manage Groups and Import. */
export function personnelToolbarItems(input: PersonnelToolbarInput): ToolbarItem[] {
	const items: ToolbarItem[] = [
		{
			kind: 'view',
			id: 'roster-view',
			label: 'Roster sort mode',
			options: ROSTER_VIEW_OPTIONS,
			value: input.viewMode,
			onValueChange: (value) => {
				if (value === 'alphabetical' || value === 'by-group') input.onViewModeChange(value);
			}
		}
	];
	if (input.onManageGroups) {
		items.push({ kind: 'action', id: 'manage-groups', label: 'Manage Groups', onclick: input.onManageGroups });
	}
	if (input.importHref) {
		items.push({ kind: 'action', id: 'import', label: 'Import', icon: 'download', href: input.importHref });
	}
	return items;
}
