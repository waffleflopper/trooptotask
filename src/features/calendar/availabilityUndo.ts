import { AVAILABILITY_BATCH_LIMIT, type AvailabilityEntry } from '$features/calendar/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { buildRequestError, rejectedRequestMessage, stillInOrganizationLifetime } from '$lib/stores/core';
import { toastStore, type ToastAction } from '$lib/stores/toast.svelte';

/** How long a success toast offers Undo. */
export const AVAILABILITY_UNDO_MS = 10_000;

/** What an action wrote: undo deletes the added entries, or saves the removed ones again. */
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
	restoredIds: string[];
	changedIds: string[];
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`);

function replyOf(value: unknown): UndoReply {
	const reply = value as Partial<UndoReply> | null;
	const ids = (list: unknown): list is string[] => Array.isArray(list) && list.every((id) => typeof id === 'string');
	if (!reply || !ids(reply.removedIds) || !ids(reply.restoredIds) || !ids(reply.changedIds))
		throw new Error('Undo could not be confirmed');
	return { removedIds: reply.removedIds, restoredIds: reply.restoredIds, changedIds: reply.changedIds };
}

const wire = (entries: readonly AvailabilityEntry[]) =>
	entries.map(({ id, personnelId, statusTypeId, startDate, endDate, note }) => ({
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
	const restore = 'restore' in change ? change.restore : [];
	const key = 'restore' in change ? 'restore' : 'remove';
	const entries = wire('restore' in change ? change.restore : change.remove);
	const removedIds: string[] = [];
	const restoredIds: string[] = [];
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
			restoredIds.push(...reply.restoredIds);
			changedIds.push(...reply.changedIds);
		} catch (error) {
			failure = error;
			break;
		}
	}
	if (!here()) return;
	if (availabilityStore.orgId === scope.orgId) {
		const removed = new Set(removedIds);
		const restored = new Set(restoredIds);
		if (removed.size) availabilityStore.removeLocalWhere((entry) => removed.has(entry.id));
		if (restored.size) availabilityStore.appendLocal(restore.filter((entry) => restored.has(entry.id)));
	}
	// A failed request may still have applied part of its batch on the server, so the Calendar rereads either way.
	if (failure || removedIds.length || restoredIds.length) scope.onUndone?.();
	if (failure) {
		const done = removedIds.length + restoredIds.length;
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
	else if (restoredIds.length)
		toastStore.success(
			plural(restoredIds.length, 'The removed status is back', 'removed statuses are back'),
			undefined,
			undefined,
			changed
		);
	else toastStore.warning('Nothing was undone', undefined, undefined, changed);
}
