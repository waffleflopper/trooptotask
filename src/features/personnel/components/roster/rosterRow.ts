import type { Personnel } from '../../personnel.types';

/** What a roster row asks of the roster around it: selection, roving focus and the row's actions. */
export interface RosterRowControls {
	readonly selecting: boolean;
	readonly selectionBusy: boolean;
	isSelected(personnelId: string): boolean;
	toggleSelected(personnelId: string): void;
	/** The one row in the tab order. */
	readonly tabRowId: string | null;
	focused(personnelId: string): void;
	recordHref(person: Personnel): string;
	openRecord(person: Personnel): void;
	/** The Person whose note composer is open, so their row can draw Note as pressed. */
	readonly noteOpenFor: string | null;
	note(person: Personnel): void;
	quickEdit(person: Personnel): void;
}

/** Moves focus to the next or previous roster row in document order, across Group sections. */
export function focusAdjacentRow(from: HTMLElement, step: 1 | -1): void {
	const rows = [...(from.closest('table')?.querySelectorAll<HTMLElement>('[data-roster-row]') ?? [])];
	rows[rows.indexOf(from) + step]?.focus();
}
