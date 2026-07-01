import { describe, expect, it } from 'vitest';
import { computeDa6Roster, type AvailabilityClassification, type Da6RosterEngineInput } from './da6RosterEngine';
import type { DutyRosterSequenceKey, DutyRosterSnapshotPersonnel } from './dutyRosterRun.types';

const available: AvailabilityClassification = {
	selectable: true,
	code: 'available-not-selected',
	da6Code: null,
	chargeable: true,
	reasonCode: null
};

const authorizedAbsence: AvailabilityClassification = {
	selectable: false,
	code: 'authorized-absence',
	da6Code: 'A',
	chargeable: false,
	reasonCode: 'authorized-absence',
	reasonParams: { statusNames: ['Leave'] }
};

const blockedByDuty: AvailabilityClassification = {
	selectable: false,
	code: 'blocked-by-duty',
	da6Code: 'D',
	chargeable: true,
	reasonCode: 'other-duty-status',
	reasonParams: { statusNames: ['CQ'] }
};

const misconductUnavailable: AvailabilityClassification = {
	selectable: false,
	code: 'misconduct-unavailable',
	da6Code: 'U',
	chargeable: true,
	reasonCode: 'misconduct-unavailable',
	reasonParams: { statusNames: ['AWOL'] }
};

function soldier(overrides: Partial<DutyRosterSnapshotPersonnel>): DutyRosterSnapshotPersonnel {
	return {
		id: overrides.id ?? 'alpha',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Able',
		firstName: overrides.firstName ?? 'Avery',
		groupId: overrides.groupId ?? 'group-a',
		groupName: overrides.groupName ?? 'Alpha',
		...overrides
	};
}

function engineInput(overrides: Partial<Da6RosterEngineInput> = {}): Da6RosterEngineInput {
	const pool = overrides.pool ?? [soldier({ id: 'alpha' })];
	const dutyDates = overrides.dutyDates ?? ['2026-05-01'];
	return {
		pool,
		dutyDates,
		sequenceByDate:
			overrides.sequenceByDate ??
			new Map(dutyDates.map((date) => [date, { sequenceKind: 'weekday', sequenceKey: 'single' }])),
		classificationByPersonDate:
			overrides.classificationByPersonDate ??
			new Map(pool.map((person) => [person.id, new Map(dutyDates.map((date) => [date, available]))])),
		priorLastDutyDates: overrides.priorLastDutyDates ?? new Map(pool.map((person) => [person.id, null])),
		manualBaselineCounts: overrides.manualBaselineCounts ?? new Map(),
		initialDa6Counts: overrides.initialDa6Counts
	};
}

describe('computeDa6Roster', () => {
	it('assigns a single available Soldier across dates while advancing DA6 column sequence starts', () => {
		const output = computeDa6Roster(engineInput({ dutyDates: ['2026-05-01', '2026-05-02', '2026-05-03'] }));

		expect(output.rosterRows).toEqual([
			{ date: '2026-05-01', assigneeId: 'alpha' },
			{ date: '2026-05-02', assigneeId: 'alpha' },
			{ date: '2026-05-03', assigneeId: 'alpha' }
		]);
		expect(output.columns.map((column) => column.chargeSequenceStart)).toEqual([1, 2, 3]);
		expect(output.cellsByPersonnelId.get('alpha')?.map((cell) => [cell.assigned, cell.sequenceNumber])).toEqual([
			[true, 1],
			[true, 1],
			[true, 1]
		]);
	});

	it('records authorized absence as a nonchargeable A cell without incrementing the Soldier sequence', () => {
		const output = computeDa6Roster(
			engineInput({
				dutyDates: ['2026-05-01', '2026-05-02'],
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', available],
							['2026-05-02', authorizedAbsence]
						])
					]
				])
			})
		);

		expect(output.cellsByPersonnelId.get('alpha')?.[1]).toMatchObject({
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			queuePosition: null,
			sequenceNumber: 1,
			assigned: false,
			reason: null,
			reasonCode: 'authorized-absence',
			reasonParams: { statusNames: ['Leave'] }
		});
	});

	it('emits an unfilled roster row when no eligible Soldier is selectable', () => {
		const output = computeDa6Roster(
			engineInput({
				classificationByPersonDate: new Map([['alpha', new Map([['2026-05-01', blockedByDuty]])]])
			})
		);

		expect(output.rosterRows).toEqual([{ date: '2026-05-01', assigneeId: null, reasonCode: 'no-eligible-personnel' }]);
		expect(output.cellsByPersonnelId.get('alpha')?.[0]).toMatchObject({
			code: 'blocked-by-duty',
			da6Code: 'D',
			chargeable: true,
			queuePosition: 1,
			assigned: false,
			reason: null,
			reasonCode: 'other-duty-status',
			reasonParams: { statusNames: ['CQ'] }
		});
	});

	it('uses manual baseline counts to seed first visible sequence numbers and Duty Priority ordering', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [soldier({ id: 'alpha', lastName: 'Able' }), soldier({ id: 'bravo', lastName: 'Baker' })],
				dutyDates: ['2026-05-01', '2026-05-02'],
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', available],
							['2026-05-02', available]
						])
					],
					[
						'bravo',
						new Map([
							['2026-05-01', available],
							['2026-05-02', available]
						])
					]
				]),
				priorLastDutyDates: new Map([
					['alpha', null],
					['bravo', null]
				]),
				manualBaselineCounts: new Map([
					['alpha', 5],
					['bravo', 2]
				])
			})
		);

		expect(output.rosterRows.map((row) => row.assigneeId)).toEqual(['alpha', 'bravo']);
		expect(output.cellsByPersonnelId.get('alpha')?.map((cell) => cell.sequenceNumber)).toEqual([5, 1]);
		expect(output.cellsByPersonnelId.get('bravo')?.map((cell) => cell.sequenceNumber)).toEqual([2, 3]);
	});

	it('uses manual baseline counts to seed separate weekday and weekend-holiday sequence numbers', () => {
		const output = computeDa6Roster(
			engineInput({
				dutyDates: ['2026-05-01', '2026-05-02'],
				sequenceByDate: new Map([
					['2026-05-01', { sequenceKind: 'weekday', sequenceKey: 'weekday' }],
					['2026-05-02', { sequenceKind: 'weekend-holiday', sequenceKey: 'weekend-holiday' }]
				]),
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', available],
							['2026-05-02', available]
						])
					]
				]),
				manualBaselineCounts: new Map([['alpha', 5]])
			})
		);

		expect(output.columns.map((column) => column.sequenceKey)).toEqual(['weekday', 'weekend-holiday']);
		expect(output.cellsByPersonnelId.get('alpha')?.map((cell) => cell.sequenceNumber)).toEqual([5, 5]);
	});

	it('seeds Duty Priority from the active sequence count when weekday and weekend counts differ', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [soldier({ id: 'alpha', lastName: 'Able' }), soldier({ id: 'bravo', lastName: 'Baker' })],
				dutyDates: ['2026-05-02'],
				sequenceByDate: new Map([['2026-05-02', { sequenceKind: 'weekend', sequenceKey: 'weekend-holiday' }]]),
				classificationByPersonDate: new Map([
					['alpha', new Map([['2026-05-02', available]])],
					['bravo', new Map([['2026-05-02', available]])]
				]),
				initialDa6Counts: new Map([
					[
						'alpha',
						new Map<DutyRosterSequenceKey, number>([
							['weekday', 10],
							['weekend-holiday', 1]
						])
					],
					[
						'bravo',
						new Map<DutyRosterSequenceKey, number>([
							['weekday', 1],
							['weekend-holiday', 5]
						])
					]
				])
			})
		);

		expect(output.rosterRows).toEqual([{ date: '2026-05-02', assigneeId: 'bravo' }]);
	});

	it('carries baseline-seeded selections into later unseeded sequence ordering', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [soldier({ id: 'alpha', lastName: 'Able' }), soldier({ id: 'bravo', lastName: 'Baker' })],
				dutyDates: ['2026-05-01', '2026-05-02'],
				sequenceByDate: new Map([
					['2026-05-01', { sequenceKind: 'weekday', sequenceKey: 'weekday' }],
					['2026-05-02', { sequenceKind: 'weekend', sequenceKey: 'weekend-holiday' }]
				]),
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', available],
							['2026-05-02', available]
						])
					],
					[
						'bravo',
						new Map([
							['2026-05-01', available],
							['2026-05-02', available]
						])
					]
				]),
				initialDa6Counts: new Map([
					['alpha', new Map<DutyRosterSequenceKey, number>([['weekday', 5]])],
					['bravo', new Map<DutyRosterSequenceKey, number>([['weekday', 1]])]
				])
			})
		);

		expect(output.rosterRows.map((row) => row.assigneeId)).toEqual(['alpha', 'bravo']);
	});

	it('orders date-priority rosters by never-assigned status, DA6 order, and oldest last duty date', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [
					soldier({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
					soldier({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
					soldier({ id: 'staff', rank: 'SSG', lastName: 'Zebra' })
				],
				dutyDates: ['2026-05-02', '2026-05-03', '2026-05-04'],
				priorLastDutyDates: new Map([
					['alpha', '2026-05-01'],
					['bravo', null],
					['staff', null]
				])
			})
		);

		expect(output.rosterRows.map((row) => row.assigneeId)).toEqual(['staff', 'bravo', 'alpha']);
	});

	it('orders default DA6 priority by shared pay-grade rank precedence, name, and deterministic unknown fallback', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [
					soldier({ id: 'unknown', rank: 'LOCAL-CADET', lastName: 'Able' }),
					soldier({ id: 'navy-e5', rank: 'PO2', lastName: 'Baker' }),
					soldier({ id: 'army-e5', rank: 'SGT', lastName: 'Able' }),
					soldier({ id: 'air-force-e5', rank: 'SSgt', lastName: 'Charlie' })
				],
				dutyDates: ['2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
				priorLastDutyDates: new Map([
					['unknown', null],
					['navy-e5', null],
					['army-e5', null],
					['air-force-e5', null]
				])
			})
		);

		expect(output.rosterRows.map((row) => row.assigneeId)).toEqual(['navy-e5', 'army-e5', 'air-force-e5', 'unknown']);
	});

	it('keeps baseline-priority rosters fair by raising passed-over Soldiers and resetting selected Soldiers', () => {
		const output = computeDa6Roster(
			engineInput({
				pool: [
					soldier({ id: 'alpha', rank: 'SGT', lastName: 'Able' }),
					soldier({ id: 'bravo', rank: 'SGT', lastName: 'Baker' }),
					soldier({ id: 'staff', rank: 'SSG', lastName: 'Zebra' })
				],
				dutyDates: ['2026-05-01', '2026-05-02', '2026-05-03'],
				manualBaselineCounts: new Map([
					['alpha', 2],
					['bravo', 2],
					['staff', 2]
				])
			})
		);

		expect(output.rosterRows.map((row) => row.assigneeId)).toEqual(['staff', 'alpha', 'bravo']);
		expect(output.cellsByPersonnelId.get('staff')?.map((cell) => cell.sequenceNumber)).toEqual([2, 1, 2]);
		expect(output.cellsByPersonnelId.get('bravo')?.map((cell) => cell.sequenceNumber)).toEqual([2, 3, 4]);
	});

	it('shows chargeable pass-overs, authorized absences, assignments, and resets in visible DA6 cells', () => {
		const output = computeDa6Roster(
			engineInput({
				dutyDates: ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05'],
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', blockedByDuty],
							['2026-05-02', misconductUnavailable],
							['2026-05-03', authorizedAbsence],
							['2026-05-04', available],
							['2026-05-05', blockedByDuty]
						])
					]
				]),
				initialDa6Counts: new Map([['alpha', new Map<DutyRosterSequenceKey, number>([['single', 2]])]])
			})
		);

		const cells = output.cellsByPersonnelId.get('alpha') ?? [];
		expect(cells.map((cell) => cell.da6Code)).toEqual(['D', 'U', 'A', null, 'D']);
		expect(cells.map((cell) => cell.assigned)).toEqual([false, false, false, true, false]);
		expect(cells.map((cell) => cell.sequenceNumber)).toEqual([2, 3, 4, 4, 1]);
	});

	it('leaves unseeded nonchargeable cells unnumbered until the Soldier is chargeable', () => {
		const output = computeDa6Roster(
			engineInput({
				dutyDates: ['2026-05-01', '2026-05-02'],
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', authorizedAbsence],
							['2026-05-02', blockedByDuty]
						])
					]
				])
			})
		);

		expect(output.cellsByPersonnelId.get('alpha')?.map((cell) => cell.sequenceNumber)).toEqual([null, 1]);
	});

	it('tracks DA6 numbering independently for weekday and weekend-holiday sequences', () => {
		const output = computeDa6Roster(
			engineInput({
				dutyDates: ['2026-05-01', '2026-05-02', '2026-05-03'],
				sequenceByDate: new Map([
					['2026-05-01', { sequenceKind: 'weekday', sequenceKey: 'weekday' }],
					['2026-05-02', { sequenceKind: 'weekend', sequenceKey: 'weekend-holiday' }],
					['2026-05-03', { sequenceKind: 'weekday', sequenceKey: 'weekday' }]
				]),
				classificationByPersonDate: new Map([
					[
						'alpha',
						new Map([
							['2026-05-01', blockedByDuty],
							['2026-05-02', blockedByDuty],
							['2026-05-03', blockedByDuty]
						])
					]
				])
			})
		);

		expect(output.columns.map((column) => column.sequenceKey)).toEqual(['weekday', 'weekend-holiday', 'weekday']);
		expect(output.cellsByPersonnelId.get('alpha')?.map((cell) => cell.sequenceNumber)).toEqual([1, 1, 2]);
	});
});
