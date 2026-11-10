import { AVAILABILITY_BATCH_LIMIT, type AvailabilityEntry } from '$features/calendar/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { buildRequestError, rejectedRequestMessage, stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore, type ToastAction } from '$lib/stores/toast.svelte';

/** How long a success toast offers Undo. */
export const AVAILABILITY_UNDO_MS = 10_000;

/** What an action wrote: undo deletes the added entries, or has the server put the removed ones back. */
export type AvailabilityUndoChange =
	| { remove: readonly AvailabilityEntry[] }
	| { restore: readonly AvailabilityEntry[] };

export interface AvailabilityUndoScope {
	readonly orgId: string;
	/** False once the caller's Organization, access or page has moved on; a stale Undo stays silent. */
	readonly isCurrent: () => boolean;
	/** Runs after an Undo changed something, for callers whose other views read from the server. */
	readonly onUndone?: () => void;
}

interface UndoReply {
	removedIds: string[];
	restored: AvailabilityEntry[];
	changedIds: string[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);

const isText = (value: unknown): value is string => typeof value === 'string';

function entryOf(value: unknown): AvailabilityEntry | null {
	const entry = value as Partial<Record<keyof AvailabilityEntry, unknown>> | null;
	if (
		!entry ||
		!isText(entry.id) ||
		!isText(entry.personnelId) ||
		!isText(entry.statusTypeId) ||
		!isText(entry.startDate) ||
		!isText(entry.endDate) ||
		!(entry.note === undefined || entry.note === null || isText(entry.note))
	)
		return null;
	return {
		id: entry.id,
		personnelId: entry.personnelId,
		statusTypeId: entry.statusTypeId,
		startDate: entry.startDate,
		endDate: entry.endDate,
		note: entry.note ?? null
	};
}

function replyOf(value: unknown): UndoReply {
	const reply = value as Partial<Record<keyof UndoReply, unknown>> | null;
	const ids = (list: unknown): list is string[] => Array.isArray(list) && list.every(isText);
	const restored = Array.isArray(reply?.restored) ? reply.restored.map(entryOf) : null;
	if (!reply || !ids(reply.removedIds) || !ids(reply.changedIds) || !restored || restored.includes(null))
		throw new Error('Undo could not be confirmed');
	return { removedIds: reply.removedIds, restored: restored as AvailabilityEntry[], changedIds: reply.changedIds };
}

/** An add's Undo names the values it must still find; a removal's Undo names only the entry, for the server's record. */
const wire = (change: AvailabilityUndoChange) =>
	'restore' in change
		? change.restore.map(({ id, personnelId }) => ({ id, personnelId }))
		: change.remove.map(({ id, personnelId, statusTypeId, startDate, endDate, note }) => ({
				id,
				personnelId,
				statusTypeId,
				startDate,
				endDate,
				note: note ?? null
			}));

/** The toast action for a status change: takes back exactly the rows it wrote, only while the caller is still here. */
export function availabilityUndoAction(change: AvailabilityUndoChange, scope: AvailabilityUndoScope): ToastAction {
	const sameLifetime = stillInOrganizationLifetime();
	const here = () => sameLifetime() && scope.isCurrent();
	return {
		label: 'Undo',
		onClick: () => {
			if (here()) void undoAvailability(change, scope, here);
		}
	};
}

async function undoAvailability(change: AvailabilityUndoChange, scope: AvailabilityUndoScope, here: () => boolean) {
	const key = 'restore' in change ? 'restore' : 'remove';
	const entries = wire(change);
	const removedIds: string[] = [];
	const restored: AvailabilityEntry[] = [];
	const changedIds: string[] = [];
	let failure: unknown = null;
	for (let start = 0; start < entries.length; start += AVAILABILITY_BATCH_LIMIT) {
		if (!here()) return;
		try {
			const response = await fetch(`/org/${scope.orgId}/api/availability/undo`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [key]: entries.slice(start, start + AVAILABILITY_BATCH_LIMIT) })
			});
			if (!response.ok) throw await buildRequestError(response, 'POST', 'availability/undo');
			const reply = replyOf(await response.json());
			removedIds.push(...reply.removedIds);
			restored.push(...reply.restored);
			changedIds.push(...reply.changedIds);
		} catch (error) {
			failure = error;
			break;
		}
	}
	if (!here()) return;
	if (availabilityStore.orgId === scope.orgId) {
		const removed = new Set(removedIds);
		if (removed.size) availabilityStore.removeLocalWhere((entry) => removed.has(entry.id));
		if (restored.length) availabilityStore.appendLocal(restored);
	}
	// A failed request may still have applied part of its batch on the server, so the Calendar rereads either way.
	if (failure || removedIds.length || restored.length) scope.onUndone?.();
	if (failure) {
		const done = removedIds.length + restored.length;
		toastStore.error(
			'Undo did not go through',
			undefined,
			undefined,
			done
				? `${plural(done, '1 status was', 'statuses were')} undone before it stopped. Check the calendar before trying again.`
				: rejectedRequestMessage(failure, 'Check the calendar before trying again.')
		);
		return;
	}
	const changed = changedIds.length
		? `${plural(changedIds.length, '1 status', 'statuses')} changed since and ${changedIds.length === 1 ? 'was' : 'were'} left as ${changedIds.length === 1 ? 'it is' : 'they are'}`
		: undefined;
	if (removedIds.length)
		toastStore.success(
			plural(removedIds.length, 'Status removed again', 'statuses removed again'),
			undefined,
			undefined,
			changed
		);
	else if (restored.length)
		toastStore.success(
			plural(restored.length, 'The removed status is back', 'removed statuses are back'),
			undefined,
			undefined,
			changed
		);
	else toastStore.warning('Nothing was undone', undefined, undefined, changed);
}
