import { describe, expect, it } from 'vitest';
import type { Personnel, StatusType } from '$lib/types';
import {
	buildAvailabilityImportPlan,
	buildRosterNameIndex,
	matchPersonnelRow,
	planStatusResolution,
	validateAvailabilityImportRow
} from './availabilityImport';

function person(over: Partial<Personnel> & { id: string }): Personnel {
	return {
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '68W',
		clinicRole: '',
		groupId: null,
		groupName: '',
		...over
	};
}

function statusType(over: Partial<StatusType> & { id: string; name: string }): StatusType {
	return { color: '#888888', ...over } as StatusType;
}

const leave = statusType({ id: 'st-leave', name: 'Leave' });

function row(over: Record<string, string> = {}): Record<string, string> {
	return {
		lastName: 'Smith',
		firstName: 'John',
		startDate: '2026-02-01',
		endDate: '2026-02-03',
		statusType: 'Leave',
		...over
	};
}

describe('matchPersonnelRow', () => {
	it('matches a unique name without needing a rank', () => {
		const index = buildRosterNameIndex([person({ id: 'p1' })]);
		const match = matchPersonnelRow(row(), index);
		expect(match).toEqual({ kind: 'matched', person: expect.objectContaining({ id: 'p1' }), issues: [] });
	});

	it('matches names case-insensitively', () => {
		const index = buildRosterNameIndex([person({ id: 'p1' })]);
		const match = matchPersonnelRow(row({ lastName: 'SMITH', firstName: 'john' }), index);
		expect(match.kind).toBe('matched');
	});

	it('requires last and first name with field-specific codes', () => {
		const index = buildRosterNameIndex([person({ id: 'p1' })]);
		expect(matchPersonnelRow(row({ lastName: ' ' }), index).issues).toEqual([
			{ field: 'lastName', code: 'last-name-required', severity: 'error' }
		]);
		expect(matchPersonnelRow(row({ firstName: '' }), index).issues).toEqual([
			{ field: 'firstName', code: 'first-name-required', severity: 'error' }
		]);
	});

	it('reports an unknown person', () => {
		const index = buildRosterNameIndex([person({ id: 'p1' })]);
		const match = matchPersonnelRow(row({ lastName: 'Jones' }), index);
		expect(match).toEqual({
			kind: 'unmatched',
			issues: [{ field: 'lastName', code: 'person-not-found', severity: 'error' }]
		});
	});

	it('warns but still matches when a rank contradicts a unique name match', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'PFC' })]);
		const match = matchPersonnelRow(row({ rank: 'SGT' }), index);
		expect(match).toEqual({
			kind: 'matched',
			person: expect.objectContaining({ id: 'p1' }),
			issues: [{ field: 'rank', code: 'rank-conflict', severity: 'warning' }]
		});
	});

	it('treats a matching rank on a unique name as clean', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'SGT' })]);
		expect(matchPersonnelRow(row({ rank: 'sgt' }), index).issues).toEqual([]);
	});

	it('rejects duplicate names without a rank to disambiguate', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'SGT' }), person({ id: 'p2', rank: 'PFC' })]);
		const match = matchPersonnelRow(row(), index);
		expect(match.issues).toEqual([{ field: 'lastName', code: 'ambiguous-name', severity: 'error' }]);
	});

	it('disambiguates duplicate names by rank', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'SGT' }), person({ id: 'p2', rank: 'PFC' })]);
		const match = matchPersonnelRow(row({ rank: 'PFC' }), index);
		expect(match).toEqual({ kind: 'matched', person: expect.objectContaining({ id: 'p2' }), issues: [] });
	});

	it('reports a rank that matches none of the duplicate names', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'SGT' }), person({ id: 'p2', rank: 'PFC' })]);
		expect(matchPersonnelRow(row({ rank: 'SSG' }), index).issues).toEqual([
			{ field: 'rank', code: 'rank-no-match', severity: 'error' }
		]);
	});

	it('reports duplicate names that share the disambiguating rank', () => {
		const index = buildRosterNameIndex([person({ id: 'p1', rank: 'SGT' }), person({ id: 'p2', rank: 'SGT' })]);
		expect(matchPersonnelRow(row({ rank: 'SGT' }), index).issues).toEqual([
			{ field: 'lastName', code: 'ambiguous-name-and-rank', severity: 'error' }
		]);
	});
});

describe('validateAvailabilityImportRow', () => {
	const index = buildRosterNameIndex([person({ id: 'p1' })]);

	it('accepts a fully valid row', () => {
		expect(validateAvailabilityImportRow(row(), index)).toEqual({ valid: true, issues: [] });
	});

	it('stays valid with only a rank-conflict warning', () => {
		const conflictIndex = buildRosterNameIndex([person({ id: 'p1', rank: 'PFC' })]);
		const result = validateAvailabilityImportRow(row({ rank: 'SGT' }), conflictIndex);
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([{ field: 'rank', code: 'rank-conflict', severity: 'warning' }]);
	});

	it('requires both dates and a status', () => {
		const result = validateAvailabilityImportRow(row({ startDate: '', endDate: '', statusType: ' ' }), index);
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([
			{ field: 'startDate', code: 'start-date-required', severity: 'error' },
			{ field: 'endDate', code: 'end-date-required', severity: 'error' },
			{ field: 'statusType', code: 'status-required', severity: 'error' }
		]);
	});

	it('rejects unparseable dates', () => {
		const result = validateAvailabilityImportRow(row({ startDate: 'not a date' }), index);
		expect(result.issues).toEqual([{ field: 'startDate', code: 'start-date-invalid', severity: 'error' }]);
	});

	it('rejects an end before the start', () => {
		const result = validateAvailabilityImportRow(row({ startDate: '2026-02-05', endDate: '2026-02-01' }), index);
		expect(result.issues).toEqual([{ field: 'endDate', code: 'end-before-start', severity: 'error' }]);
	});

	it('collects matching and date issues together', () => {
		const result = validateAvailabilityImportRow(row({ lastName: 'Jones', endDate: 'bogus' }), index);
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([
			{ field: 'lastName', code: 'person-not-found', severity: 'error' },
			{ field: 'endDate', code: 'end-date-invalid', severity: 'error' }
		]);
	});
});

describe('planStatusResolution', () => {
	it('returns nothing when every status name matches a Status Type', () => {
		expect(planStatusResolution([row(), row({ statusType: 'LEAVE' })], [leave])).toEqual([]);
	});

	it('counts each unresolved name with original casing preserved', () => {
		const rows = [row({ statusType: 'JRTC' }), row({ statusType: 'jrtc' }), row({ statusType: 'Staff Duty' })];
		expect(planStatusResolution(rows, [leave])).toEqual([
			{ csvName: 'JRTC', count: 2 },
			{ csvName: 'Staff Duty', count: 1 }
		]);
	});

	it('ignores rows with no status name', () => {
		expect(planStatusResolution([row({ statusType: '' })], [leave])).toEqual([]);
	});
});

describe('buildAvailabilityImportPlan', () => {
	const personnel = [person({ id: 'p1' }), person({ id: 'p2', lastName: 'Jones', firstName: 'Amy', rank: 'SSG' })];

	it('builds records for matched rows with normalized dates and note handling', () => {
		const plan = buildAvailabilityImportPlan(
			[
				{ rowNumber: 2, values: row({ note: '  JRTC rotation ' }) },
				{ rowNumber: 3, values: row({ lastName: 'Jones', firstName: 'Amy', note: '' }) }
			],
			{ personnel, statusTypes: [leave] }
		);
		expect(plan.skipped).toEqual([]);
		expect(plan.records).toEqual([
			{
				personnelId: 'p1',
				statusTypeId: 'st-leave',
				startDate: '2026-02-01',
				endDate: '2026-02-03',
				note: 'JRTC rotation'
			},
			{ personnelId: 'p2', statusTypeId: 'st-leave', startDate: '2026-02-01', endDate: '2026-02-03', note: null }
		]);
	});

	it('imports a rank-conflict warning row against the matched person', () => {
		const plan = buildAvailabilityImportPlan([{ rowNumber: 2, values: row({ rank: 'CPL' }) }], {
			personnel,
			statusTypes: [leave]
		});
		expect(plan.records).toHaveLength(1);
		expect(plan.records[0].personnelId).toBe('p1');
	});

	it('applies manual status resolutions and explicit skips', () => {
		const resolutions = new Map<string, string | 'skip'>([
			['jrtc', 'st-leave'],
			['staff duty', 'skip']
		]);
		const plan = buildAvailabilityImportPlan(
			[
				{ rowNumber: 2, values: row({ statusType: 'JRTC' }) },
				{ rowNumber: 3, values: row({ statusType: 'Staff Duty' }) }
			],
			{ personnel, statusTypes: [leave], resolutions }
		);
		expect(plan.records).toEqual([
			{ personnelId: 'p1', statusTypeId: 'st-leave', startDate: '2026-02-01', endDate: '2026-02-03', note: null }
		]);
		expect(plan.skipped).toEqual([{ rowNumber: 3, code: 'status-skipped' }]);
	});

	it('gives every dropped row an explicit skip reason', () => {
		const plan = buildAvailabilityImportPlan(
			[
				{ rowNumber: 2, values: row({ statusType: 'Unknown' }) },
				{ rowNumber: 3, values: row({ lastName: 'Nobody' }) },
				{ rowNumber: 4, values: row({ startDate: 'bogus' }) }
			],
			{ personnel, statusTypes: [leave] }
		);
		expect(plan.records).toEqual([]);
		expect(plan.skipped).toEqual([
			{ rowNumber: 2, code: 'status-unresolved' },
			{ rowNumber: 3, code: 'person-unmatched' },
			{ rowNumber: 4, code: 'date-invalid' }
		]);
	});
});
