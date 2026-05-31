/**
 * Availability mutation — the provider-free rules shared by the Add, Remove, and Import
 * bulk status surfaces.
 *
 * This module owns the domain rules those surfaces previously each re-derived:
 * - validating a Daily Assignment Slot date range and counting the days it covers
 * - the canonical Availability Status interval-overlap predicate
 * - classifying which existing Availability Status entries a removal would touch,
 *   split into entries fully inside the range (exact) and entries that extend beyond it (partial)
 * - building the batch of availability records for a bulk add
 *
 * It is intentionally pure: no store, no fetch, no `$app`. Callers own selection,
 * provider dispatch, and presentation; this module owns the rules. The interface is the
 * test surface.
 */
import type { AvailabilityEntry } from '$lib/types';

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
		return { valid: false, dayCount: 0, error: null };
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
