import { describe, it, expect } from 'vitest';
import { filterColumnsByView } from './viewFiltering';
import type { TrainingType, TrainingView } from '../training.types';

function makeType(id: string, name: string, sortOrder: number): TrainingType {
	return {
		id,
		name,
		sortOrder,
		color: '#000',
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
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false
	};
}

function makeView(columnIds: string[]): TrainingView {
	return {
		id: 'view-1',
		name: 'Test View',
		columnIds,
		createdBy: 'user-1',
		createdAt: '2026-03-24T00:00:00Z',
		updatedAt: '2026-03-24T00:00:00Z'
	};
}

const allTypes: TrainingType[] = [
	makeType('tt-1', 'CPR', 2),
	makeType('tt-2', 'Weapons', 0),
	makeType('tt-3', 'PT Test', 1),
	makeType('tt-4', 'Land Nav', 3)
];

describe('filterColumnsByView', () => {
	it('returns all types in global sortOrder when view is null (All Trainings)', () => {
		const result = filterColumnsByView(allTypes, null);

		expect(result.map((t) => t.name)).toEqual(['Weapons', 'PT Test', 'CPR', 'Land Nav']);
	});

	it('returns only matching types in view column order', () => {
		const view = makeView(['tt-3', 'tt-1']);

		const result = filterColumnsByView(allTypes, view);

		expect(result.map((t) => t.name)).toEqual(['PT Test', 'CPR']);
	});

	it('preserves view column order independent of global sortOrder', () => {
		const view = makeView(['tt-4', 'tt-2', 'tt-1']);

		const result = filterColumnsByView(allTypes, view);

		expect(result.map((t) => t.name)).toEqual(['Land Nav', 'Weapons', 'CPR']);
	});

	it('skips column IDs that no longer exist in training types', () => {
		const view = makeView(['tt-1', 'tt-deleted', 'tt-3']);

		const result = filterColumnsByView(allTypes, view);

		expect(result.map((t) => t.name)).toEqual(['CPR', 'PT Test']);
	});

	it('returns empty array for view with no matching columns', () => {
		const view = makeView(['tt-gone-1', 'tt-gone-2']);

		const result = filterColumnsByView(allTypes, view);

		expect(result).toEqual([]);
	});

	it('returns empty array when all types is empty', () => {
		const view = makeView(['tt-1']);

		const result = filterColumnsByView([], view);

		expect(result).toEqual([]);
	});

	it('returns empty array for null view with empty types', () => {
		const result = filterColumnsByView([], null);

		expect(result).toEqual([]);
	});
});
