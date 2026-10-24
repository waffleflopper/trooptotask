import type { Personnel } from '../../personnel.types';
import type { RosterFilter } from '../../rosterSignals';
import type { RosterQuickEdit } from './quickEdit.svelte';

/** What a roster row asks of the roster around it: selection, roving focus and the row's actions. */
export interface RosterRowControls {
	/** Whether rows carry a selection checkbox. */
	readonly selectable: boolean;
	isSelected(personnelId: string): boolean;
	/** `range` extends from the last row set, as Shift-click does. */
	select(personnelId: string, selected: boolean, range: boolean): void;
	/** The active roster filter, whose matched item the Needs attention cell shows. */
	readonly filter: RosterFilter | null;
	/** The one row in the tab order. */
	readonly tabRowId: string | null;
	focused(personnelId: string): void;
	recordHref(person: Personnel): string;
	openRecord(person: Personnel): void;
	/** The Person whose note composer is open, so their row can draw Note as pressed. */
	readonly noteOpenFor: string | null;
	note(person: Personnel): void;
	/** The roster's one quick editor. */
	readonly edit: RosterQuickEdit;
}

/** Moves focus to the next or previous roster row in document order, across Group sections. */
export function focusAdjacentRow(from: HTMLElement, step: 1 | -1): void {
	const rows = [...(from.closest('table')?.querySelectorAll<HTMLElement>('[data-roster-row]') ?? [])];
	rows[rows.indexOf(from) + step]?.focus();
}
