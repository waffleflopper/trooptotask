import type { AvailabilityEntry } from '$features/calendar/contracts';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import {
	classifyAvailabilityWrite,
	rereadDatesFor,
	type AvailabilityChange
} from '$features/calendar/utils/availabilityMutation';
import { loadCalendarRange } from '$features/calendar/utils/calendarRangeLoader';
import { rangeCoversSpan } from '$features/calendar/utils/calendarRange';
import { rejectedRequestMessage, StoreRequestError, withinOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';

/** `busy` means another change was still settling, so this one was not sent. `stale` means the Organization or access changed. */
export type AvailabilityOutcome = 'saved' | 'not-saved' | 'unconfirmed' | 'stale' | 'busy';

export interface AvailabilitySaveScope {
	readonly orgId: string;
	/** False once the caller's Organization or access has moved on; a stale save stays silent. */
	readonly isCurrent: () => boolean;
}

/** Writes one change through the shared availability store; when the reply is lost, re-reads the dates to learn whether it landed. */
export async function saveAvailabilityChange(
	change: AvailabilityChange,
	scope: AvailabilitySaveScope
): Promise<Exclude<AvailabilityOutcome, 'busy'>> {
	const entriesBeforeWrite = [...availabilityStore.items];
	let confirmed = false;
	let refusal: StoreRequestError | null = null;
	try {
		confirmed = await writeAvailability(change);
	} catch (error) {
		if (error instanceof StoreRequestError && error.status >= 400 && error.status < 500) refusal = error;
	}
	if (!scope.isCurrent()) return 'stale';
	if (confirmed) {
		announceSaved(change);
		return 'saved';
	}
	// A 4xx means the server refused the write and saved nothing, so there is nothing to reconcile.
	if (refusal) {
		toastStore.error(rejectedRequestMessage(refusal, 'Could not save status. Try again.'));
		return 'not-saved';
	}
	let reread: AvailabilityEntry[] | null;
	try {
		reread = await reconcileAvailability(rereadDatesFor(change), scope);
	} catch {
		toastStore.error('Could not confirm the saved status. Reload the calendar before trying again.');
		return 'unconfirmed';
	}
	if (reread === null) return 'stale';
	const outcome = classifyAvailabilityWrite(change, entriesBeforeWrite, reread);
	if (outcome === 'saved') announceSaved(change);
	else toastStore.error(`Could not ${change.kind === 'remove' ? 'remove' : 'save'} status. Try again.`);
	return outcome;
}

/** Re-reads each date and reconciles it into the store. Null when the scope went stale before the read landed. */
export async function reconcileAvailability(
	dates: string[],
	scope: AvailabilitySaveScope
): Promise<AvailabilityEntry[] | null> {
	if (!scope.isCurrent()) return null;
	const read = availabilityStore.beginRead();
	try {
		let ranges: Awaited<ReturnType<typeof loadCalendarRange>>[];
		try {
			ranges = await withinOrganizationLifetime(
				Promise.all(
					[...new Set(dates)].map((date) =>
						loadCalendarRange(scope.orgId, { rangeStart: date, rangeEnd: date, collections: ['availability'] })
					)
				)
			);
		} catch (error) {
			if (!scope.isCurrent()) return null;
			throw error;
		}
		if (!scope.isCurrent()) return null;
		const entriesByRange = ranges.map((range) => ({ range, entries: range.availabilityEntries ?? [] }));
		for (const { range, entries } of entriesByRange) {
			availabilityStore.load(
				availabilityStore.orgId === scope.orgId ? read.reconcile(entries, rangeCoversSpan(range)) : entries,
				scope.orgId
			);
		}
		return [...new Map(entriesByRange.flatMap(({ entries }) => entries.map((entry) => [entry.id, entry]))).values()];
	} finally {
		read.close();
	}
}

async function writeAvailability(change: AvailabilityChange): Promise<boolean> {
	switch (change.kind) {
		case 'create':
			return (await availabilityStore.add(change.record)) !== null;
		case 'update':
			return availabilityStore.updateOrThrow(change.entry.id, change.changes);
		case 'remove':
			return availabilityStore.removeBool(change.entry.id);
	}
}

function shortDate(dateKey: string): string {
	return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function announceSaved(change: AvailabilityChange): void {
	if (change.kind === 'remove') {
		toastStore.success('Status removed');
		return;
	}
	const values = change.kind === 'create' ? change.record : change.changes;
	const name = statusTypesStore.items.find((status) => status.id === values.statusTypeId)?.name ?? 'Status';
	const dates =
		values.startDate === values.endDate
			? shortDate(values.startDate)
			: `${shortDate(values.startDate)}–${shortDate(values.endDate)}`;
	toastStore.success(`${name} ${change.kind === 'create' ? 'added' : 'updated'} — ${dates}`, 5000);
}
