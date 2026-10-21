/**
 * Its boundary is string-free: issues and skip reasons are stable codes, and the import
 * surface maps codes to copy — the same discipline as a Policy Reason Code outside the
 * Policy Evaluator. A Rank that contradicts a unique name match is a `rank-conflict`
 * warning, not a hard block: the row stays importable against the matched person.
 *
 * It is intentionally pure: no store, no fetch, no `$app`.
 */
import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import type { ColumnDef } from '$lib/utils/columnMapping';
import { parseDateString } from '$lib/utils/csvParser';
import { validateDateRange, type AvailabilityRecord } from './availabilityMutation';

export const STATUS_IMPORT_COLUMNS: ColumnDef[] = [
	{
		key: 'lastName',
		label: 'Last Name',
		required: true,
		aliases: ['last name', 'lastname', 'surname', 'lname']
	},
	{
		key: 'firstName',
		label: 'First Name',
		required: true,
		aliases: ['first name', 'firstname', 'fname', 'given name']
	},
	{
		key: 'startDate',
		label: 'Start Date',
		required: true,
		aliases: ['start date', 'start', 'from', 'begin']
	},
	{
		key: 'endDate',
		label: 'End Date',
		required: true,
		aliases: ['end date', 'end', 'to', 'through']
	},
	{
		key: 'statusType',
		label: 'Status',
		required: true,
		aliases: ['status', 'status type', 'type']
	},
	{
		key: 'rank',
		label: 'Rank',
		required: false,
		aliases: ['rank', 'grade', 'pay grade']
	},
	{
		key: 'note',
		label: 'Note',
		required: false,
		aliases: ['note', 'notes', 'comment', 'remarks']
	}
];

/** Values for one parsed import row, keyed by the STATUS_IMPORT_COLUMNS field keys. */
export type AvailabilityImportRowValues = Record<string, string>;

export type AvailabilityImportIssueCode =
	| 'last-name-required'
	| 'first-name-required'
	| 'person-not-found'
	| 'ambiguous-name'
	| 'ambiguous-name-and-rank'
	| 'rank-no-match'
	| 'rank-conflict'
	| 'start-date-required'
	| 'start-date-invalid'
	| 'end-date-required'
	| 'end-date-invalid'
	| 'end-before-start'
	| 'status-required'
	| 'note-too-long';

export interface AvailabilityImportIssue {
	field: 'lastName' | 'firstName' | 'rank' | 'startDate' | 'endDate' | 'statusType' | 'note';
	code: AvailabilityImportIssueCode;
	severity: 'error' | 'warning';
}

export interface AvailabilityImportRowValidation {
	/** True when the row has no error-severity issues; warnings do not block import. */
	valid: boolean;
	issues: AvailabilityImportIssue[];
}

export type PersonnelRowMatch =
	| { kind: 'matched'; person: Personnel; issues: AvailabilityImportIssue[] }
	| { kind: 'unmatched'; issues: AvailabilityImportIssue[] };

/** Index of personnel by the case-insensitive `last|first` name key used for row matching. */
export type RosterNameIndex = ReadonlyMap<string, Personnel[]>;

function nameKey(lastName: string, firstName: string): string {
	return `${lastName.toLowerCase()}|${firstName.toLowerCase()}`;
}

export function buildRosterNameIndex(personnel: readonly Personnel[]): RosterNameIndex {
	const index = new Map<string, Personnel[]>();
	for (const person of personnel) {
		const key = nameKey(person.lastName, person.firstName);
		const existing = index.get(key);
		if (existing) {
			existing.push(person);
		} else {
			index.set(key, [person]);
		}
	}
	return index;
}

/**
 * The single implementation of row-to-Personnel-Record matching, used by both validation
 * and record building so the two can never drift. Rank disambiguates duplicate names;
 * a Rank that contradicts a unique name match downgrades to a `rank-conflict` warning.
 */
export function matchPersonnelRow(row: AvailabilityImportRowValues, index: RosterNameIndex): PersonnelRowMatch {
	const lastName = (row.lastName ?? '').trim();
	const firstName = (row.firstName ?? '').trim();
	if (!lastName) {
		return { kind: 'unmatched', issues: [{ field: 'lastName', code: 'last-name-required', severity: 'error' }] };
	}
	if (!firstName) {
		return { kind: 'unmatched', issues: [{ field: 'firstName', code: 'first-name-required', severity: 'error' }] };
	}

	const matches = index.get(nameKey(lastName, firstName)) ?? [];
	const rank = (row.rank ?? '').trim().toLowerCase();

	if (matches.length === 0) {
		return { kind: 'unmatched', issues: [{ field: 'lastName', code: 'person-not-found', severity: 'error' }] };
	}

	if (matches.length === 1) {
		const person = matches[0];
		const issues: AvailabilityImportIssue[] =
			rank && person.rank.toLowerCase() !== rank ? [{ field: 'rank', code: 'rank-conflict', severity: 'warning' }] : [];
		return { kind: 'matched', person, issues };
	}

	if (!rank) {
		return { kind: 'unmatched', issues: [{ field: 'lastName', code: 'ambiguous-name', severity: 'error' }] };
	}
	const rankMatches = matches.filter((person) => person.rank.toLowerCase() === rank);
	if (rankMatches.length === 1) {
		return { kind: 'matched', person: rankMatches[0], issues: [] };
	}
	if (rankMatches.length === 0) {
		return { kind: 'unmatched', issues: [{ field: 'rank', code: 'rank-no-match', severity: 'error' }] };
	}
	return { kind: 'unmatched', issues: [{ field: 'lastName', code: 'ambiguous-name-and-rank', severity: 'error' }] };
}

/** The saved note limit; the database rejects a longer note and fails the whole batch. */
const NOTE_MAX_LENGTH = 200;

export function validateAvailabilityImportRow(
	row: AvailabilityImportRowValues,
	index: RosterNameIndex
): AvailabilityImportRowValidation {
	const issues: AvailabilityImportIssue[] = [...matchPersonnelRow(row, index).issues];

	const rawStart = (row.startDate ?? '').trim();
	const rawEnd = (row.endDate ?? '').trim();
	const startDate = rawStart ? parseDateString(rawStart) : null;
	const endDate = rawEnd ? parseDateString(rawEnd) : null;

	if (!rawStart) {
		issues.push({ field: 'startDate', code: 'start-date-required', severity: 'error' });
	} else if (!startDate) {
		issues.push({ field: 'startDate', code: 'start-date-invalid', severity: 'error' });
	}
	if (!rawEnd) {
		issues.push({ field: 'endDate', code: 'end-date-required', severity: 'error' });
	} else if (!endDate) {
		issues.push({ field: 'endDate', code: 'end-date-invalid', severity: 'error' });
	}
	if (startDate && endDate && validateDateRange(startDate, endDate).error) {
		issues.push({ field: 'endDate', code: 'end-before-start', severity: 'error' });
	}

	if (!(row.statusType ?? '').trim()) {
		issues.push({ field: 'statusType', code: 'status-required', severity: 'error' });
	}

	if ((row.note ?? '').trim().length > NOTE_MAX_LENGTH) {
		issues.push({ field: 'note', code: 'note-too-long', severity: 'error' });
	}

	return { valid: issues.every((issue) => issue.severity !== 'error'), issues };
}

export interface UnresolvedStatusName {
	/** The status name as it first appears in the rows, original casing preserved. */
	csvName: string;
	/** How many rows carry this status name. */
	count: number;
}

/** Resolution of one unresolved CSV status name: a Status Type id, or an explicit skip. */
export type StatusResolution = string | 'skip';

function statusTypeIdsByName(statusTypes: readonly StatusType[]): Map<string, string> {
	return new Map(statusTypes.map((statusType) => [statusType.name.toLowerCase(), statusType.id]));
}

/**
 * Plan which CSV status names need manual resolution: every distinct name that does not
 * match a Status Type by case-insensitive name, with its row count for the resolve UI.
 */
export function planStatusResolution(
	rows: readonly AvailabilityImportRowValues[],
	statusTypes: readonly StatusType[]
): UnresolvedStatusName[] {
	const known = statusTypeIdsByName(statusTypes);
	const unresolved = new Map<string, UnresolvedStatusName>();
	for (const row of rows) {
		const csvName = (row.statusType ?? '').trim();
		if (!csvName) continue;
		const lower = csvName.toLowerCase();
		if (known.has(lower)) continue;
		const existing = unresolved.get(lower);
		if (existing) {
			existing.count += 1;
		} else {
			unresolved.set(lower, { csvName, count: 1 });
		}
	}
	return [...unresolved.values()];
}

export type AvailabilityImportSkipCode = 'person-unmatched' | 'date-invalid' | 'status-skipped' | 'status-unresolved';

export interface AvailabilityImportPlan {
	records: AvailabilityRecord[];
	skipped: { rowNumber: number; code: AvailabilityImportSkipCode }[];
}

export interface AvailabilityImportPlanInput {
	personnel: readonly Personnel[];
	statusTypes: readonly StatusType[];
	/** Manual resolutions for unresolved CSV status names, keyed by lowercase name. */
	resolutions?: ReadonlyMap<string, StatusResolution>;
}

/**
 * Build the batch records for the selected rows. Rows are expected to have passed
 * validation, but every drop-out still gets an explicit skip reason so the import can
 * never silently lose a row.
 */
export function buildAvailabilityImportPlan(
	rows: readonly { rowNumber: number; values: AvailabilityImportRowValues }[],
	input: AvailabilityImportPlanInput
): AvailabilityImportPlan {
	const index = buildRosterNameIndex(input.personnel);
	const known = statusTypeIdsByName(input.statusTypes);
	const resolutions = input.resolutions ?? new Map<string, StatusResolution>();

	const records: AvailabilityRecord[] = [];
	const skipped: AvailabilityImportPlan['skipped'] = [];

	for (const { rowNumber, values } of rows) {
		const statusName = (values.statusType ?? '').trim().toLowerCase();
		const resolution = known.get(statusName) ?? resolutions.get(statusName);
		if (resolution === 'skip') {
			skipped.push({ rowNumber, code: 'status-skipped' });
			continue;
		}
		if (!resolution) {
			skipped.push({ rowNumber, code: 'status-unresolved' });
			continue;
		}

		const match = matchPersonnelRow(values, index);
		if (match.kind !== 'matched') {
			skipped.push({ rowNumber, code: 'person-unmatched' });
			continue;
		}

		const startDate = parseDateString((values.startDate ?? '').trim());
		const endDate = parseDateString((values.endDate ?? '').trim());
		if (!startDate || !endDate || !validateDateRange(startDate, endDate).valid) {
			skipped.push({ rowNumber, code: 'date-invalid' });
			continue;
		}

		records.push({
			personnelId: match.person.id,
			statusTypeId: resolution,
			startDate,
			endDate,
			note: (values.note ?? '').trim() || null
		});
	}

	return { records, skipped };
}
