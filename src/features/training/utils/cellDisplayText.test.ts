import { describe, it, expect } from 'vitest';
import {
	getCellDisplayText,
	getCellStatusLabel,
	getColumnIntervalLabel,
	getStatusLine,
	renewalMode
} from './cellDisplayText';
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
	return getCellDisplayText(getTrainingStatus(training, type, person, asOf), training, type);
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

	it('shows the completion month, not an old stored expiry, once a type never expires', () => {
		const type = makeType({ expirationMonths: null });
		const training = makeTraining({ completionDate: '2026-03-02', expirationDate: '2027-03-02' });
		expect(cellText(type, training, '2026-10-25')).toBe('Mar ’26');
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

describe('getCellStatusLabel', () => {
	const spoken = (type: TrainingType, training: PersonnelTraining | undefined) =>
		getCellStatusLabel(getTrainingStatus(training, type, person, '2026-10-25'));

	it('speaks the words a cell shows for a missing record and a requirement that does not apply', () => {
		expect(spoken(makeType(), undefined)).toBe('No record');
		expect(spoken(makeType({ appliesToMos: ['91B'] }), undefined)).toBe('Not required');
	});

	it('keeps the status wording for a record', () => {
		expect(spoken(makeType(), makeTraining({ expirationDate: '2026-08-04' }))).toBe('Expired 82d ago');
		expect(spoken(makeType(), makeTraining({ expirationDate: '2026-12-08' }))).toBe('44d left');
	});
});

describe('getColumnIntervalLabel', () => {
	it('names the renewal interval of each renewal kind', () => {
		expect(getColumnIntervalLabel(makeType({ expirationMonths: 36 }))).toBe('36 mo');
		expect(getColumnIntervalLabel(makeType({ expirationDateOnly: true, expirationMonths: null }))).toBe('Date');
		expect(getColumnIntervalLabel(makeType({ expirationMonths: null }))).toBe('No expiry');
	});
});

describe('renewalMode', () => {
	it.each([
		{ type: makeType(), expected: 'months' },
		{ type: makeType({ expirationMonths: null }), expected: 'never' },
		{ type: makeType({ expirationDateOnly: true }), expected: 'cardDate' },
		{ type: makeType({ expirationDateOnly: true, expirationMonths: null }), expected: 'cardDate' }
	])('reads $expected', ({ type, expected }) => {
		expect(renewalMode(type)).toBe(expected);
	});
});

describe('getStatusLine', () => {
	function line(type: TrainingType, training: PersonnelTraining | undefined, asOf: string) {
		return getStatusLine(getTrainingStatus(training, type, person, asOf), training, type);
	}

	it.each([
		{
			name: 'expired',
			training: makeTraining({ expirationDate: '2026-08-04' }),
			expected: { tone: 'danger', text: 'Expired 4 Aug 2026 · 82 days ago' }
		},
		{
			name: 'expiring',
			training: makeTraining({ expirationDate: '2026-11-11' }),
			expected: { tone: 'warning', text: 'Expires 11 Nov 2026 · 17 days left' }
		},
		{
			name: 'current',
			training: makeTraining({ expirationDate: '2027-06-15' }),
			expected: { tone: 'muted', text: 'Current until 15 Jun 2027' }
		},
		{ name: 'no record', training: undefined, expected: { tone: 'danger', text: 'No record' } }
	])('says $name', ({ training, expected }) => {
		expect(line(makeType(), training, '2026-10-25')).toEqual(expected);
	});

	it('says a never-expiring record is current without a date', () => {
		const type = makeType({ expirationMonths: null });
		expect(line(type, makeTraining({ expirationDate: null }), '2026-10-25')).toEqual({
			tone: 'muted',
			text: 'Current · never expires'
		});
	});
});
