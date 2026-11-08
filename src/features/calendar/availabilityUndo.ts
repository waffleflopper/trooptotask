import type { AvailabilityEntry } from '$features/calendar/contracts';
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
	try {
		const response = await fetch(`/org/${scope.orgId}/api/availability/undo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify('restore' in change ? { restore: wire(restore) } : { remove: wire(change.remove) })
		});
		if (!response.ok) throw await buildRequestError(response, 'POST', 'availability/undo');
		const { removedIds, restoredIds, changedIds } = replyOf(await response.json());
		if (!here()) return;
		if (availabilityStore.orgId === scope.orgId) {
			const removed = new Set(removedIds);
			const restored = new Set(restoredIds);
			if (removed.size) availabilityStore.removeLocalWhere((entry) => removed.has(entry.id));
			if (restored.size) availabilityStore.appendLocal(restore.filter((entry) => restored.has(entry.id)));
		}
		if (removedIds.length || restoredIds.length) scope.onUndone?.();
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
	} catch (error) {
		if (here())
			toastStore.error(
				'Undo did not go through',
				undefined,
				undefined,
				rejectedRequestMessage(error, 'Nothing changed. Try again in a moment.')
			);
	}
}
