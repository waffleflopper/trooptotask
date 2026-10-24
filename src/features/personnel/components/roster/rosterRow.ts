import type { Personnel } from '../../personnel.types';
import type { RosterQuickEdit } from './quickEdit.svelte';

/** What a roster row asks of the roster around it: selection, roving focus and the row's actions. */
export interface RosterRowControls {
	/** Whether rows carry a selection checkbox. */
	readonly selectable: boolean;
	isSelected(personnelId: string): boolean;
	/** `range` extends from the last row set, as Shift-click does. */
	select(personnelId: string, selected: boolean, range: boolean): void;
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
	/** The Person in the open peek panel, or null while it is closed. */
	readonly peekedId: string | null;
	/** Whether the screen is wide enough for the peek panel; below it Space selects and a row click opens the record. */
	readonly peekFits: boolean;
	/** Shows a Person in the peek panel. False when the screen is too narrow for it, so the row opens the record. */
	peek(person: Personnel): boolean;
	/** Closes the peek panel and returns focus to the row it showed. */
	closePeek(): void;
	/** J, K, Esc and Tab while the peek panel is open. True when the key was the panel's. */
	peekKey(event: KeyboardEvent): boolean;
}

/** Moves focus to the next or previous roster row in document order, across Group sections. */
export function focusAdjacentRow(from: HTMLElement, step: 1 | -1): void {
	const rows = [...(from.closest('table')?.querySelectorAll<HTMLElement>('[data-roster-row]') ?? [])];
	rows[rows.indexOf(from) + step]?.focus();
}
