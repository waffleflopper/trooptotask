import type { Personnel } from '../../personnel.types';
import type { RosterQuickEdit } from './quickEdit.svelte';

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
	note(person: Personnel): void;
	/** The roster's one quick editor. */
	readonly edit: RosterQuickEdit;
}

/** Moves focus to the next or previous roster row in document order, across Group sections. */
export function focusAdjacentRow(from: HTMLElement, step: 1 | -1): void {
	const rows = [...(from.closest('table')?.querySelectorAll<HTMLElement>('[data-roster-row]') ?? [])];
	rows[rows.indexOf(from) + step]?.focus();
}
