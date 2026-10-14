/**
 * Changes the server confirmed, ordered by one sequence shared by every store. A snapshot read
 * re-applies the changes confirmed after its request left, because the server may have read
 * before them.
 */
export type ConfirmedChange<T> =
	| { sequence: number; saved: T[]; deleted: string[] }
	| { sequence: number; deletedWhere: (item: T) => boolean }
	| { sequence: number; updatedWhere: (item: T) => boolean; update: (item: T) => T };

export type ConfirmedChangeInput<T> =
	| { saved?: T[]; deleted?: string[] }
	| { deletedWhere: (item: T) => boolean }
	| { updatedWhere: (item: T) => boolean; update: (item: T) => T };

let sequence = 0;
let requested = 0;

export function nextConfirmedSequence(): number {
	return ++sequence;
}

export function confirmedSequence(): number {
	return sequence;
}

/** Call just before starting a request whose response a store reconciles later, such as a navigation. */
export function markSnapshotRequest(): void {
	requested = sequence;
}

/** The sequence when the latest snapshot request left. */
export function snapshotRequestSequence(): number {
	return requested;
}

export function applyConfirmedChange<T extends { id: string }>(items: T[], change: ConfirmedChangeInput<T>): T[] {
	if ('deletedWhere' in change) return items.filter((item) => !change.deletedWhere(item));
	if ('updatedWhere' in change) {
		return items.map((item) => (change.updatedWhere(item) ? change.update(item) : item));
	}
	const deleted: Record<string, true> = Object.create(null);
	for (const id of change.deleted ?? []) deleted[id] = true;
	const saved: Record<string, T> = Object.create(null);
	for (const item of change.saved ?? []) saved[item.id] = item;
	const kept = items.filter((item) => !deleted[item.id]).map((item) => saved[item.id] ?? item);
	const present: Record<string, true> = Object.create(null);
	for (const item of kept) present[item.id] = true;
	return [...kept, ...(change.saved ?? []).filter((item) => !present[item.id])];
}
