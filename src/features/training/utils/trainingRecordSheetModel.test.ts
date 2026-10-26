import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { buildTrainingRecordSheet } from './trainingRecordSheetModel';

const ASOF = '2026-10-25';

const person = {
	id: 'p1',
	rank: 'PFC',
	lastName: 'Brooks',
	firstName: 'Jalen',
	mos: '92Y',
	clinicRole: 'Supply'
} as Personnel;

function type(id: string, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name: id,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#000000',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function record(typeId: string, completionDate: string | null, expirationDate: string | null): PersonnelTraining {
	return {
		id: `r-${typeId}`,
		personnelId: person.id,
		trainingTypeId: typeId,
		completionDate,
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

describe('buildTrainingRecordSheet', () => {
	const types = [
		type('current-a'),
		type('expired'),
		type('no-record-1'),
		type('soon-far'),
		type('soon-near'),
		type('no-record-2'),
		type('current-b'),
		type('drivers', { appliesToRoles: ['Driver'] }),
		type('exempt', { canBeExempted: true, exemptPersonnelIds: [person.id] }),
		type('card', { expirationDateOnly: true })
	];
	const records = [
		record('current-a', '2026-10-06', '2027-10-06'),
		record('expired', '2025-08-04', '2026-08-04'),
		record('soon-far', '2025-12-25', '2026-12-10'),
		record('soon-near', '2025-11-11', '2026-11-11'),
		record('current-b', '2026-10-08', '2027-10-08')
	];
	const sheet = buildTrainingRecordSheet({ person, types, records, asOf: ASOF });
	const ids = (items: { type: TrainingType }[]) => items.map((item) => item.type.id);

	it('orders what needs action: expired, then no record, then expiring soonest first', () => {
		expect(ids(sheet.needsAction)).toEqual(['expired', 'no-record-1', 'no-record-2', 'card', 'soon-near', 'soon-far']);
	});

	it('lists current, not required and exempt types in column order', () => {
		expect(ids(sheet.current)).toEqual(['current-a', 'current-b']);
		expect(ids(sheet.notRequired)).toEqual(['drivers']);
		expect(ids(sheet.exempt)).toEqual(['exempt']);
	});

	it('gives a not-required type the reason from its applicability', () => {
		expect(sheet.notRequired[0].reason).toBe('Role: Driver');
		expect(sheet.current[0].reason).toBeNull();
	});

	it('leaves a card-date type out of what one click records', () => {
		expect(ids(sheet.recordableToday)).toEqual(['expired', 'no-record-1', 'no-record-2', 'soon-near', 'soon-far']);
	});

	it('counts readiness over the requirements that apply and are not exempt, in column order', () => {
		expect(sheet.segments).toEqual([
			'ready',
			'expired',
			'missing',
			'expiring',
			'expiring',
			'missing',
			'ready',
			'missing'
		]);
		expect(sheet.ready).toBe(4);
		expect(sheet.toRecord).toBe(4);
	});

	it('does not count an optional type that has no record', () => {
		const withOptional = buildTrainingRecordSheet({
			person,
			types: [type('a'), type('opt', { isOptional: true })],
			records: [record('a', '2026-10-06', '2027-10-06')],
			asOf: ASOF
		});
		expect(withOptional.segments).toEqual(['ready']);
		expect(withOptional.notRequired.map((item) => item.type.id)).toEqual(['opt']);
		expect(withOptional.notRequired[0].reason).toBe('Optional');
	});

	it("ignores another Soldier's record", () => {
		const other = { ...record('a', '2026-10-06', '2027-10-06'), personnelId: 'p2' };
		const result = buildTrainingRecordSheet({ person, types: [type('a')], records: [other], asOf: ASOF });
		expect(result.segments).toEqual(['missing']);
		expect(result.current).toEqual([]);
	});
});
