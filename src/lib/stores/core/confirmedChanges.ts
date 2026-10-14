/**
 * Changes the server confirmed, ordered by a sequence shared by every store in this browser. A
 * snapshot request carries the sequence of the latest change confirmed before it left, so applying
 * the snapshot can re-apply every change confirmed after that, which the server may not have read.
 */
export type ConfirmedChange<T> =
	| { sequence: number; saved: T[]; deleted: string[] }
	| { sequence: number; deletedWhere: (item: T) => boolean }
	| { sequence: number; updatedWhere: (item: T) => boolean; update: (item: T) => T };

export type ConfirmedChangeInput<T> =
	| { saved?: T[]; deleted?: string[] }
	| { deletedWhere: (item: T) => boolean }
	| { updatedWhere: (item: T) => boolean; update: (item: T) => T };

/** Every request, including navigations and preloads, sends this cookie as it leaves. */
export const CONFIRMED_CHANGE_COOKIE = 't2t-confirmed-change';

/** How long a store keeps changes for responses whose requests have not arrived yet. */
export const CONFIRMED_CHANGE_RETENTION_MS = 10 * 60 * 1000;

let sequence = 0;

// Milliseconds keep the sequence comparable across this browser's tabs, which share the cookie.
export function nextConfirmedSequence(): number {
	sequence = Math.max(Date.now(), sequence + 1);
	if (typeof document !== 'undefined') {
		document.cookie = `${CONFIRMED_CHANGE_COOKIE}=${sequence}; path=/; SameSite=Lax`;
	}
	return sequence;
}

export function confirmedSequence(): number {
	return sequence;
}

export function parseConfirmedSequence(value: string | undefined): number {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
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
