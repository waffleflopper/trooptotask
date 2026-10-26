import { describe, it, expect } from 'vitest';
import { getCellDisplayText, getColumnIntervalLabel } from './cellDisplayText';
import { getTrainingStatus } from './trainingStatus';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

const person = { id: 'p-1', rank: 'SGT', mos: '68W', clinicRole: 'Medic' };

function makeType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'tt-1',
		name: 'CPR',
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
		color: '#22c55e',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: true,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 't-1',
		personnelId: person.id,
		trainingTypeId: 'tt-1',
		completionDate: '2026-06-15',
		expirationDate: '2027-06-15',
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

function cellText(type: TrainingType, training: PersonnelTraining | undefined, asOf: string): string {
	return getCellDisplayText(getTrainingStatus(training, type, person, asOf), training);
}

describe('getCellDisplayText', () => {
	it('shows the month a current record lapses', () => {
		expect(cellText(makeType(), makeTraining(), '2026-10-25')).toBe('Jun ’27');
	});

	it('shows the completion month for a type that never expires', () => {
		const type = makeType({ expirationMonths: null });
		expect(cellText(type, makeTraining({ completionDate: '2026-03-02', expirationDate: null }), '2026-10-25')).toBe(
			'Mar ’26'
		);
	});

	it('shows the lapse month of a card-date record', () => {
		const type = makeType({ expirationDateOnly: true, expirationMonths: null });
		const training = makeTraining({ completionDate: null, expirationDate: '2028-01-09' });
		expect(cellText(type, training, '2026-10-25')).toBe('Jan ’28');
	});

	it('shows days left for the first and final warning windows', () => {
		const type = makeType();
		expect(cellText(type, makeTraining({ expirationDate: '2026-12-08' }), '2026-10-25')).toBe('44d');
		expect(cellText(type, makeTraining({ expirationDate: '2026-11-06' }), '2026-10-25')).toBe('12d');
	});

	it('shows Expired once the expiration date has passed', () => {
		expect(cellText(makeType(), makeTraining({ expirationDate: '2026-08-04' }), '2026-10-25')).toBe('Expired');
	});

	it('shows No record when a required type has no record', () => {
		expect(cellText(makeType(), undefined, '2026-10-25')).toBe('No record');
	});

	it('shows a quiet dash when the type does not apply to the person', () => {
		expect(cellText(makeType({ appliesToMos: ['91B'] }), undefined, '2026-10-25')).toBe('—');
	});

	it('shows Exempt for an exempted person', () => {
		expect(cellText(makeType({ exemptPersonnelIds: [person.id] }), undefined, '2026-10-25')).toBe('Exempt');
	});
});

describe('getColumnIntervalLabel', () => {
	it('names the renewal interval of each renewal kind', () => {
		expect(getColumnIntervalLabel(makeType({ expirationMonths: 36 }))).toBe('36 mo');
		expect(getColumnIntervalLabel(makeType({ expirationDateOnly: true, expirationMonths: null }))).toBe('Date');
		expect(getColumnIntervalLabel(makeType({ expirationMonths: null }))).toBe('No expiry');
	});
});
