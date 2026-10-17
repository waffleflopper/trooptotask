/**
 * Availability mutation — the provider-free rules shared by the calendar and the Add, Remove,
 * and Import bulk status surfaces.
 *
 * This module owns the domain rules those surfaces previously each re-derived:
 * - validating a Daily Assignment Slot date range and counting the days it covers
 * - the canonical Availability Status interval-overlap predicate
 * - classifying which existing Availability Status entries a removal would touch,
 *   split into entries fully inside the range (exact) and entries that extend beyond it (partial)
 * - classifying which people a bulk add would overlap, where an entry of the same status blocks them
 * - building the batch of availability records for a bulk add
 * - judging whether a calendar write whose reply was lost landed anyway
 *
 * It is intentionally pure: no store, no fetch, no `$app`. Callers own selection,
 * provider dispatch, and presentation; this module owns the rules. The interface is the
 * test surface.
 */
import type { AvailabilityEntry } from '$features/calendar/contracts';

/** The shape the availability batch endpoint and store accept for a bulk add. */
export interface AvailabilityRecord {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note: string | null;
}

export interface DateRangeValidation {
	/** True only when both dates are present and start is on or before end. */
	valid: boolean;
	/** Inclusive number of days the range covers, or 0 when the range is empty or invalid. */
	dayCount: number;
	/** Human-facing validation message, or null when there is nothing to report. */
	error: string | null;
}

/** A `has`-only view of selected personnel ids (e.g. a Set or a DataTable selection's key set). */
export interface PersonnelIdMembership {
	has(id: string): boolean;
}

export interface AvailabilityOverlapCriteria {
	personnelIds: PersonnelIdMembership;
	statusTypeId: string;
	startDate: string;
	endDate: string;
}

export interface ClassifiedOverlaps {
	/** Entries fully inside the selected range. */
	exact: AvailabilityEntry[];
	/** Entries that overlap the selected range but extend beyond it. */
	partial: AvailabilityEntry[];
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Parse an ISO `YYYY-MM-DD` date to UTC midnight millis. UTC avoids the daylight-saving
 * off-by-one that local-midnight arithmetic can introduce in a day count.
 */
function utcMillis(isoDate: string): number {
	const [year, month, day] = isoDate.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
}

export function validateDateRange(startDate: string, endDate: string): DateRangeValidation {
	if (!startDate || !endDate) {
		const error =
			!startDate && !endDate
				? 'Choose a start date and an end date'
				: !startDate
					? 'Choose a start date'
					: 'Choose an end date';
		return { valid: false, dayCount: 0, error };
	}
	if (startDate > endDate) {
		return { valid: false, dayCount: 0, error: 'End date must be on or after start date' };
	}
	const dayCount = Math.floor((utcMillis(endDate) - utcMillis(startDate)) / DAY_MS) + 1;
	return { valid: true, dayCount, error: null };
}

/** Canonical inclusive interval-overlap predicate for ISO `YYYY-MM-DD` ranges. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
	return aStart <= bEnd && aEnd >= bStart;
}

/**
 * Classify the Availability Status entries a removal over [startDate, endDate] would touch
 * for the selected personnel and status. Overlapping entries are removed in full, so the
 * partial set is what the review step must warn about.
 */
export function classifyAvailabilityOverlaps(
	entries: readonly AvailabilityEntry[],
	criteria: AvailabilityOverlapCriteria
): ClassifiedOverlaps {
	const { personnelIds, statusTypeId, startDate, endDate } = criteria;
	const exact: AvailabilityEntry[] = [];
	const partial: AvailabilityEntry[] = [];

	for (const entry of entries) {
		if (!personnelIds.has(entry.personnelId)) continue;
		if (entry.statusTypeId !== statusTypeId) continue;
		if (!rangesOverlap(entry.startDate, entry.endDate, startDate, endDate)) continue;

		if (entry.startDate >= startDate && entry.endDate <= endDate) {
			exact.push(entry);
		} else {
			partial.push(entry);
		}
	}

	return { exact, partial };
}

/**
 * A person's existing entries against a bulk add. `already-on-status` means some entry of the status being
 * added intersects the range, so adding it would stack a duplicate; the person cannot be selected. `overlap`
 * means only other statuses intersect, which stacks legitimately. Same status wins when both are present.
 * A person with no intersecting entry is absent from the classification.
 */
export interface BulkAddOverlap {
	readonly kind: 'overlap' | 'already-on-status';
	/** Intersecting entries of the status being added; the reason a row is blocked. */
	readonly sameStatus: readonly AvailabilityEntry[];
	/** Intersecting entries of other statuses. */
	readonly otherStatus: readonly AvailabilityEntry[];
}

export function classifyBulkAddOverlaps(input: {
	entries: readonly AvailabilityEntry[];
	statusTypeId: string;
	range: { rangeStart: string; rangeEnd: string };
}): ReadonlyMap<string, BulkAddOverlap> {
	const { entries, statusTypeId, range } = input;
	const sameStatus = new Map<string, AvailabilityEntry[]>();
	const otherStatus = new Map<string, AvailabilityEntry[]>();

	for (const entry of entries) {
		if (!rangesOverlap(entry.startDate, entry.endDate, range.rangeStart, range.rangeEnd)) continue;
		const bucket = entry.statusTypeId === statusTypeId ? sameStatus : otherStatus;
		const list = bucket.get(entry.personnelId);
		if (list) list.push(entry);
		else bucket.set(entry.personnelId, [entry]);
	}

	const overlaps = new Map<string, BulkAddOverlap>();
	for (const personnelId of new Set([...sameStatus.keys(), ...otherStatus.keys()])) {
		const same = sameStatus.get(personnelId) ?? [];
		overlaps.set(personnelId, {
			kind: same.length > 0 ? 'already-on-status' : 'overlap',
			sameStatus: same,
			otherStatus: otherStatus.get(personnelId) ?? []
		});
	}
	return overlaps;
}

/** Build the batch of availability records to apply one status/range to many personnel. */
export function buildAddRecords(
	personnelIds: readonly string[],
	statusTypeId: string,
	startDate: string,
	endDate: string,
	note: string | null
): AvailabilityRecord[] {
	return personnelIds.map((personnelId) => ({
		personnelId,
		statusTypeId,
		startDate,
		endDate,
		note
	}));
}

export type AvailabilityChange =
	| { readonly kind: 'create'; readonly record: AvailabilityRecord }
	| {
			readonly kind: 'update';
			readonly entry: AvailabilityEntry;
			readonly changes: Pick<AvailabilityRecord, 'statusTypeId' | 'startDate' | 'endDate' | 'note'>;
	  }
	| { readonly kind: 'remove'; readonly entry: AvailabilityEntry };

export function rereadDatesFor(change: AvailabilityChange): string[] {
	switch (change.kind) {
		case 'create':
			return [change.record.startDate];
		case 'update':
			return [...new Set([change.entry.startDate, change.changes.startDate])];
		case 'remove':
			return [change.entry.startDate];
	}
}

function holds(entry: AvailabilityEntry, values: Omit<AvailabilityRecord, 'personnelId'>): boolean {
	return (
		entry.statusTypeId === values.statusTypeId &&
		entry.startDate === values.startDate &&
		entry.endDate === values.endDate &&
		(entry.note ?? null) === values.note
	);
}

export function classifyAvailabilityWrite(
	change: AvailabilityChange,
	entriesBeforeWrite: readonly AvailabilityEntry[],
	reread: readonly AvailabilityEntry[]
): 'saved' | 'not-saved' {
	switch (change.kind) {
		case 'create': {
			const { personnelId, ...values } = change.record;
			const idsBeforeWrite = new Set(entriesBeforeWrite.map((entry) => entry.id));
			const landed = reread.some(
				(entry) => !idsBeforeWrite.has(entry.id) && entry.personnelId === personnelId && holds(entry, values)
			);
			return landed ? 'saved' : 'not-saved';
		}
		case 'update':
			return reread.some((entry) => entry.id === change.entry.id && holds(entry, change.changes))
				? 'saved'
				: 'not-saved';
		case 'remove':
			return reread.some((entry) => entry.id === change.entry.id) ? 'not-saved' : 'saved';
	}
}
