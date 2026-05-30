import { describe, expect, it } from 'vitest';
import {
	__testing,
	computeDa6Roster,
	type AvailabilityClassification,
	type Da6RosterEngineInput
} from './da6RosterEngine';
import type { DutyRosterSnapshotPersonnel } from './dutyRosterRun.types';

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
		manualBaselineCounts: overrides.manualBaselineCounts ?? new Map()
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
});

describe('Duty Priority', () => {
	it('ranks never-assigned Soldiers before already-assigned Soldiers, then uses DA6 Roster Order', () => {
		const alpha = soldier({ id: 'alpha', rank: 'SGT', lastName: 'Able' });
		const bravo = soldier({ id: 'bravo', rank: 'SGT', lastName: 'Baker' });
		const staff = soldier({ id: 'staff', rank: 'SSG', lastName: 'Zebra' });
		const priority = __testing.lastDutyDatePriority(
			new Map([
				['alpha', '2026-05-01'],
				['bravo', null],
				['staff', null]
			])
		);

		expect(priority.compare(bravo, alpha)).toBeLessThan(0);
		expect(priority.compare(alpha, bravo)).toBeGreaterThan(0);
		expect(priority.compare(staff, bravo)).toBeLessThan(0);
	});

	it('updates last-duty-date priority when a Soldier is selected', () => {
		const alpha = soldier({ id: 'alpha', rank: 'SGT', lastName: 'Able' });
		const bravo = soldier({ id: 'bravo', rank: 'SGT', lastName: 'Baker' });
		const priority = __testing.lastDutyDatePriority(
			new Map([
				['alpha', '2026-05-01'],
				['bravo', null]
			])
		);

		priority.recordSelection('bravo', '2026-05-02');

		expect(priority.compare(alpha, bravo)).toBeLessThan(0);
	});

	it('raises passed-over Soldiers, resets selected Soldiers, and uses DA6 Roster Order for count ties', () => {
		const alpha = soldier({ id: 'alpha', rank: 'SGT', lastName: 'Able' });
		const bravo = soldier({ id: 'bravo', rank: 'SGT', lastName: 'Baker' });
		const staff = soldier({ id: 'staff', rank: 'SSG', lastName: 'Zebra' });
		const priority = __testing.baselineCountPriority(
			new Map([
				['alpha', 2],
				['bravo', 2],
				['staff', 2]
			])
		);

		expect(priority.compare(staff, alpha)).toBeLessThan(0);

		priority.recordPassedOver('bravo');

		expect(priority.compare(bravo, staff)).toBeLessThan(0);

		priority.recordSelection('bravo', '2026-05-01');

		expect(priority.compare(staff, bravo)).toBeLessThan(0);
	});
});

describe('DA6 Numbering', () => {
	it('does not increment for an A cell and resumes from the interrupted sequence number', () => {
		const numbering = __testing.createDa6Numbering(new Map([['alpha', 2]]));

		expect(numbering.current('alpha', 'single', true)).toBe(2);
		numbering.record('alpha', 'single', { assigned: false, chargeable: true });

		expect(numbering.current('alpha', 'single', false)).toBe(3);
		numbering.record('alpha', 'single', { assigned: false, chargeable: false });

		expect(numbering.current('alpha', 'single', true)).toBe(3);
	});

	it('increments through D and U chargeable outcomes', () => {
		const numbering = __testing.createDa6Numbering(new Map());

		expect(numbering.current('alpha', 'single', true)).toBe(1);
		numbering.record('alpha', 'single', { assigned: false, chargeable: true });

		expect(numbering.current('alpha', 'single', true)).toBe(2);
		numbering.record('alpha', 'single', { assigned: false, chargeable: true });

		expect(numbering.current('alpha', 'single', true)).toBe(3);
	});

	it('resets the next displayed number to 1 after an assignment', () => {
		const numbering = __testing.createDa6Numbering(new Map([['alpha', 5]]));

		expect(numbering.current('alpha', 'single', true)).toBe(5);
		numbering.record('alpha', 'single', { assigned: true, chargeable: true });

		expect(numbering.current('alpha', 'single', true)).toBe(1);
	});

	it('uses Manual DA6 Baseline counts as the first displayed number', () => {
		const numbering = __testing.createDa6Numbering(new Map([['alpha', 4]]));

		expect(numbering.current('alpha', 'single', true)).toBe(4);
	});

	it('starts an unseeded chargeable Soldier at 1', () => {
		const numbering = __testing.createDa6Numbering(new Map());

		expect(numbering.current('alpha', 'single', true)).toBe(1);
		expect(numbering.current('bravo', 'single', false)).toBeNull();
	});

	it('tracks numbering independently per DA6 sequence key', () => {
		const numbering = __testing.createDa6Numbering(new Map());

		expect(numbering.current('alpha', 'single', true)).toBe(1);
		numbering.record('alpha', 'single', { assigned: false, chargeable: true });

		expect(numbering.current('alpha', 'single', true)).toBe(2);
		expect(numbering.current('alpha', 'weekday', true)).toBe(1);
		expect(numbering.current('alpha', 'weekend-holiday', true)).toBe(1);
	});
});
