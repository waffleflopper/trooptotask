import { describe, it, expect } from 'vitest';
import { getExpirationMode, toExpirationFields, formatApplicability, getTypeSummaryLine } from './trainingTypeDisplay';
import type { TrainingType } from '$features/training/training.types';

function makeType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'tt-1',
		name: 'Test Type',
		description: null,
		expirationMonths: null,
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

describe('getExpirationMode', () => {
	it('returns "fixed" when expirationMonths is set and not date-only', () => {
		const type = makeType({ expirationMonths: 12, expirationDateOnly: false });
		expect(getExpirationMode(type)).toBe('fixed');
	});

	it('returns "never" when expirationMonths is null and not date-only', () => {
		const type = makeType({ expirationMonths: null, expirationDateOnly: false });
		expect(getExpirationMode(type)).toBe('never');
	});

	it('returns "date-only" when expirationDateOnly is true regardless of expirationMonths', () => {
		const type = makeType({ expirationDateOnly: true, expirationMonths: null });
		expect(getExpirationMode(type)).toBe('date-only');
	});

	it('returns "date-only" when expirationDateOnly is true even with expirationMonths set', () => {
		const type = makeType({ expirationDateOnly: true, expirationMonths: 12 });
		expect(getExpirationMode(type)).toBe('date-only');
	});
});

describe('toExpirationFields', () => {
	it('returns fixed expiration fields with given months', () => {
		expect(toExpirationFields('fixed', 12)).toEqual({
			expirationMonths: 12,
			expirationDateOnly: false
		});
	});

	it('returns never-expires fields', () => {
		expect(toExpirationFields('never', null)).toEqual({
			expirationMonths: null,
			expirationDateOnly: false
		});
	});

	it('returns date-only fields with null expirationMonths', () => {
		expect(toExpirationFields('date-only', null)).toEqual({
			expirationMonths: null,
			expirationDateOnly: true
		});
	});

	it('clears expirationMonths when switching to never', () => {
		expect(toExpirationFields('never', 12)).toEqual({
			expirationMonths: null,
			expirationDateOnly: false
		});
	});

	it('clears expirationMonths when switching to date-only', () => {
		expect(toExpirationFields('date-only', 6)).toEqual({
			expirationMonths: null,
			expirationDateOnly: true
		});
	});
});

describe('formatApplicability', () => {
	it('returns "Everyone" when all applies-to dimensions are empty', () => {
		expect(formatApplicability(makeType())).toBe('Everyone');
	});

	it('returns role names when only roles specified', () => {
		expect(formatApplicability(makeType({ appliesToRoles: ['Medic', 'Driver'] }))).toBe('Medic, Driver');
	});

	it('returns single role name', () => {
		expect(formatApplicability(makeType({ appliesToRoles: ['Infantry'] }))).toBe('Infantry');
	});

	it('returns MOS codes when only MOS specified', () => {
		expect(formatApplicability(makeType({ appliesToMos: ['68W'] }))).toBe('MOS: 68W');
	});

	it('returns rank names when only ranks specified', () => {
		expect(formatApplicability(makeType({ appliesToRanks: ['SGT', 'SSG'] }))).toBe('Ranks: SGT, SSG');
	});

	it('combines multiple dimensions', () => {
		const type = makeType({ appliesToRoles: ['NCO'], appliesToMos: ['68W'] });
		expect(formatApplicability(type)).toBe('NCO, MOS: 68W');
	});

	it('shows exclusion count when exclusions exist', () => {
		const type = makeType({ excludedRoles: ['Officer'] });
		expect(formatApplicability(type)).toBe('Everyone (1 exclusion)');
	});

	it('shows plural exclusions count', () => {
		const type = makeType({ excludedRoles: ['Officer'], excludedMos: ['68W'] });
		expect(formatApplicability(type)).toBe('Everyone (2 exclusions)');
	});
});

describe('getTypeSummaryLine', () => {
	it('shows months and applicability for fixed expiration', () => {
		const type = makeType({ expirationMonths: 12 });
		expect(getTypeSummaryLine(type)).toBe('12mo | Everyone');
	});

	it('shows "Never expires" for never mode', () => {
		const type = makeType({ expirationMonths: null, appliesToRoles: ['Medic'] });
		expect(getTypeSummaryLine(type)).toBe('Never expires | Medic');
	});

	it('shows "Date varies" for date-only mode', () => {
		const type = makeType({ expirationDateOnly: true });
		expect(getTypeSummaryLine(type)).toBe('Date varies | Everyone');
	});

	it('shows "Date varies" for date-only even with stale expirationMonths', () => {
		const type = makeType({ expirationDateOnly: true, expirationMonths: 6 });
		expect(getTypeSummaryLine(type)).toBe('Date varies | Everyone');
	});
});
