import { invalidate } from '$app/navigation';
import { buildRequestError, rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
import { toastStore, type ToastAction } from '$lib/stores/toast.svelte';

/** How long an archive offers Undo. */
export const ARCHIVE_UNDO_MS = 10_000;

export interface ArchiveUndone {
	restoredIds: string[];
	/** Restored, archived again or moved out of reach since; left as they are. */
	changedIds: string[];
	withdrawnRequestIds: string[];
	/** Already reviewed or withdrawn, so there was nothing left to cancel. */
	reviewedRequestIds: string[];
}

const UNCONFIRMED = 'Undo could not be confirmed';

/** Sends the token an archive returned, which names exactly what it archived and requested. */
export async function undoArchive(orgId: string, token: string): Promise<ArchiveUndone> {
	let response: Response;
	try {
		response = await fetch(`/org/${orgId}/api/personnel/archive-batch/undo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token })
		});
	} catch {
		throw new Error(UNCONFIRMED);
	}
	if (!response.ok) {
		const failure = await buildRequestError(response, 'POST', 'personnel/archive-batch/undo');
		throw new Error(rejectedRequestMessage(failure, UNCONFIRMED));
	}
	const result: unknown = await response.json().catch(() => null);
	const { restoredIds, changedIds, withdrawnRequestIds, reviewedRequestIds } = (result ?? {}) as Partial<ArchiveUndone>;
	const ids = (list: unknown): list is string[] => Array.isArray(list) && list.every((id) => typeof id === 'string');
	if (!ids(restoredIds) || !ids(changedIds) || !ids(withdrawnRequestIds) || !ids(reviewedRequestIds))
		throw new Error(UNCONFIRMED);
	return { restoredIds, changedIds, withdrawnRequestIds, reviewedRequestIds };
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const requests = (n: number) => `${n} archival ${n === 1 ? 'request' : 'requests'}`;

/** What to tell the person once an Undo ran; `undone` is false when it changed nothing. */
export function describeArchiveUndo(done: ArchiveUndone): { message: string; description?: string; undone: boolean } {
	const parts = [
		done.restoredIds.length > 0 && `${people(done.restoredIds.length)} restored`,
		done.withdrawnRequestIds.length > 0 && `${requests(done.withdrawnRequestIds.length)} withdrawn`
	].filter((part): part is string => part !== false);
	const left = [
		done.changedIds.length > 0 && `${people(done.changedIds.length)} changed since and stay as they are`,
		done.reviewedRequestIds.length > 0 && `${requests(done.reviewedRequestIds.length)} already reviewed`
	].filter((part): part is string => part !== false);
	return {
		message: parts.length ? parts.join(' · ') : 'Nothing was undone',
		...(left.length ? { description: left.join(' · ') } : {}),
		undone: parts.length > 0
	};
}

/**
 * The toast action that takes an archive back. It does nothing, and writes and says nothing later, once `isCurrent`
 * is false or the Organization has changed.
 */
export function archiveUndoAction(
	orgId: string,
	token: string,
	isCurrent: () => boolean,
	onRestored?: (ids: string[]) => void
): ToastAction {
	return {
		label: 'Undo',
		onClick: () => {
			if (!isCurrent()) return;
			void (async () => {
				try {
					const done = await withinOrganizationLifetime(undoArchive(orgId, token), isCurrent);
					const { message, description, undone } = describeArchiveUndo(done);
					if (undone) toastStore.success(message, undefined, undefined, description);
					else toastStore.warning(message, undefined, undefined, description);
					if (!undone) return;
					if (done.restoredIds.length) onRestored?.(done.restoredIds);
					try {
						await invalidate('app:personnel-data');
					} catch {
						if (isCurrent())
							toastStore.warning('Undo was saved, but the roster could not be refreshed. Refresh to check it.');
					}
				} catch (caught) {
					if (isCurrent())
						toastStore.error(
							'Undo did not go through',
							undefined,
							undefined,
							caught instanceof Error ? caught.message : 'Nothing changed. Try again in a moment.'
						);
				}
			})();
		}
	};
}
