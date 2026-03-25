import { describe, it, expect } from 'vitest';
import { isTrainingApplicable } from './applicability';
import type { TrainingType } from '$features/training/training.types';
import type { Personnel } from '$lib/types';

function makeType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'type-1',
		name: 'Test Training',
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
		color: '#6b7280',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'NCO',
		groupId: null,
		groupName: 'Unassigned',
		...overrides
	};
}

describe('isTrainingApplicable', () => {
	it('returns false when isOptional is true regardless of other settings', () => {
		const type = makeType({ isOptional: true });
		const person = makePerson();

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('returns true when all applies-to dimensions are empty (everyone)', () => {
		const type = makeType();
		const person = makePerson();

		expect(isTrainingApplicable(type, person)).toBe(true);
	});

	it('returns true when person matches a specified role', () => {
		const type = makeType({ appliesToRoles: ['NCO'] });
		const person = makePerson({ clinicRole: 'NCO' });

		expect(isTrainingApplicable(type, person)).toBe(true);
	});

	it('returns false when person does not match any specified role', () => {
		const type = makeType({ appliesToRoles: ['Officer'] });
		const person = makePerson({ clinicRole: 'NCO' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('returns true when person matches a specified MOS', () => {
		const type = makeType({ appliesToMos: ['68W'] });
		const person = makePerson({ mos: '68W' });

		expect(isTrainingApplicable(type, person)).toBe(true);
	});

	it('returns false when person does not match any specified MOS', () => {
		const type = makeType({ appliesToMos: ['68W'] });
		const person = makePerson({ mos: '11B' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('returns true when person matches a specified rank', () => {
		const type = makeType({ appliesToRanks: ['SGT'] });
		const person = makePerson({ rank: 'SGT' });

		expect(isTrainingApplicable(type, person)).toBe(true);
	});

	it('returns false when person does not match any specified rank', () => {
		const type = makeType({ appliesToRanks: ['CPT'] });
		const person = makePerson({ rank: 'SGT' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('uses OR logic across dimensions — matches MOS even if role does not match', () => {
		const type = makeType({ appliesToRoles: ['Officer'], appliesToMos: ['11B'] });
		const person = makePerson({ clinicRole: 'NCO', mos: '11B' });

		expect(isTrainingApplicable(type, person)).toBe(true);
	});

	it('uses OR logic — no match in any dimension returns false', () => {
		const type = makeType({ appliesToRoles: ['Officer'], appliesToMos: ['68W'], appliesToRanks: ['CPT'] });
		const person = makePerson({ clinicRole: 'NCO', mos: '11B', rank: 'SGT' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('excludes by role even when applies-to matches', () => {
		const type = makeType({ appliesToRoles: ['NCO'], excludedRoles: ['NCO'] });
		const person = makePerson({ clinicRole: 'NCO' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('excludes by MOS even when applies-to matches', () => {
		const type = makeType({ excludedMos: ['11B'] });
		const person = makePerson({ mos: '11B' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('excludes by rank even when applies-to matches', () => {
		const type = makeType({ excludedRanks: ['SGT'] });
		const person = makePerson({ rank: 'SGT' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('excludes from everyone when applies-to is empty', () => {
		const type = makeType({ excludedRoles: ['NCO'] });
		const person = makePerson({ clinicRole: 'NCO' });

		expect(isTrainingApplicable(type, person)).toBe(false);
	});

	it('does not exclude when person does not match exclusion', () => {
		const type = makeType({ excludedRoles: ['Officer'] });
		const person = makePerson({ clinicRole: 'NCO' });

		expect(isTrainingApplicable(type, person)).toBe(true);
	});
});
