import type { Personnel } from '../../personnel.types';
import type { RosterFilter } from '../../rosterSignals';
import type { RosterQuickEdit } from './quickEdit.svelte';

export interface RosterRowControls {
	readonly selectable: boolean;
	isSelected(personnelId: string): boolean;
	select(personnelId: string, selected: boolean, range: boolean): void;
	readonly filter: RosterFilter | null;
	readonly tabRowId: string | null;
	focused(personnelId: string): void;
	recordHref(person: Personnel): string;
	openRecord(person: Personnel): void;
	readonly noteOpenFor: string | null;
	note(person: Personnel): void;
	readonly edit: RosterQuickEdit;
	readonly peekedId: string | null;
	readonly peekFits: boolean;
	peek(person: Personnel): boolean;
	closePeek(): void;
	peekKey(event: KeyboardEvent): boolean;
}

export function focusAdjacentRow(from: HTMLElement, step: 1 | -1): void {
	const rows = [...(from.closest('table')?.querySelectorAll<HTMLElement>('[data-roster-row]') ?? [])];
	rows[rows.indexOf(from) + step]?.focus();
}
