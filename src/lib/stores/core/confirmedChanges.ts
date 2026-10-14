/**
 * Changes the server confirmed, numbered by one sequence per browser tab. Each tab writes its
 * latest number to its own cookie, so a snapshot request carries the change its tab confirmed
 * last before the request left. Applying the snapshot re-applies every later change, which the
 * server may not have read.
 */
export type ConfirmedChange<T> = { sequence: number; confirmedAt: number } & ConfirmedChangeInput<T>;

export type ConfirmedChangeInput<T> =
	| { saved?: T[]; deleted?: string[] }
	| { deletedWhere: (item: T) => boolean }
	| { updatedWhere: (item: T) => boolean; update: (item: T) => T };

/** Requests echo these cookies back; the suffix names the tab that wrote one. */
export const CONFIRMED_CHANGE_COOKIE_PREFIX = 't2t-confirmed-';

/** How long a store keeps changes for responses whose requests have not arrived yet. */
export const CONFIRMED_CHANGE_RETENTION_MS = 10 * 60 * 1000;

// Bounds cookies left by tabs that closed without a final `pagehide`.
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

/** The confirmed-change sequence each tab's cookie carried on one request. */
export type ConfirmedChangesByTab = Record<string, number>;

export class SnapshotTooOldError extends Error {
	constructor() {
		super('The snapshot left before changes it needs were discarded');
	}
}

const tab = typeof crypto !== 'undefined' ? crypto.randomUUID() : 'server';
const cookieName = `${CONFIRMED_CHANGE_COOKIE_PREFIX}${tab}`;
let sequence = 0;

function writeCookie(value: number | null) {
	if (typeof document === 'undefined') return;
	document.cookie =
		value === null
			? `${cookieName}=; path=/; Max-Age=0`
			: `${cookieName}=${value}; path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

if (typeof window !== 'undefined') {
	// A closed tab's cookie would otherwise ride along on every later request.
	window.addEventListener('pagehide', (event) => {
		if (!event.persisted) writeCookie(null);
	});
	window.addEventListener('pageshow', () => {
		if (sequence > 0) writeCookie(sequence);
	});
}

/** Number a change and send it with every request this tab starts afterwards. */
export function nextConfirmedSequence(): number {
	writeCookie(++sequence);
	return sequence;
}

export function confirmedSequence(): number {
	return sequence;
}

/**
 * The sequence this tab's cookie carried, from the values a delivery echoed. A request without one
 * left before this tab confirmed anything, or after its cookie expired; either way it is recent.
 */
export function confirmedBeforeRequest(byTab: ConfirmedChangesByTab): number {
	return byTab[tab] ?? 0;
}

export function readConfirmedChangeCookies(cookies: Array<{ name: string; value: string }>): ConfirmedChangesByTab {
	const byTab: ConfirmedChangesByTab = {};
	for (const { name, value } of cookies) {
		const parsed = Number(value);
		if (name.startsWith(CONFIRMED_CHANGE_COOKIE_PREFIX) && Number.isSafeInteger(parsed) && parsed > 0) {
			byTab[name.slice(CONFIRMED_CHANGE_COOKIE_PREFIX.length)] = parsed;
		}
	}
	return byTab;
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
