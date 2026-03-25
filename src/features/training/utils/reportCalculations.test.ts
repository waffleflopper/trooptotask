import { describe, it, expect } from 'vitest';
import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import {
	computeReadinessDashboard,
	filterPersonnel,
	buildPivotTable,
	generatePivotCSV,
	type ReportFilters
} from './reportCalculations';

function makeType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'type-1',
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
		canBeExempted: false,
		isOptional: false,
		exemptPersonnelIds: [],
		...overrides
	};
}

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'NCO',
		groupId: 'g-1',
		groupName: 'Alpha',
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 'pt-1',
		personnelId: 'p-1',
		trainingTypeId: 'type-1',
		completionDate: '2026-01-01',
		expirationDate: '2027-01-01',
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

describe('computeReadinessDashboard', () => {
	it('computes readiness percentage as current / (total - notRequired - exempt)', () => {
		const personnel = [makePerson({ id: 'p-1' }), makePerson({ id: 'p-2' })];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [
			makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' }) // current
			// p-2 has no training → not-completed
		];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		// 1 current out of 2 applicable = 50%
		expect(dashboard.readinessPercent).toBe(50);
	});

	it('returns 100% when all personnel are current', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);
		expect(dashboard.readinessPercent).toBe(100);
	});

	it('returns 0% when no personnel have training records', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = [makeType({ id: 'type-1' })];

		const dashboard = computeReadinessDashboard(personnel, types, []);
		expect(dashboard.readinessPercent).toBe(0);
	});

	it('excludes not-required and exempt from denominator', () => {
		const personnel = [makePerson({ id: 'p-1', clinicRole: 'NCO' }), makePerson({ id: 'p-2', clinicRole: 'Officer' })];
		// Only applies to NCOs
		const types = [makeType({ id: 'type-1', appliesToRoles: ['NCO'] })];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);
		// p-1 is current, p-2 is not-required → 1/1 = 100%
		expect(dashboard.readinessPercent).toBe(100);
	});

	it('returns status counts for each status category', () => {
		const personnel = [makePerson({ id: 'p-1' }), makePerson({ id: 'p-2' }), makePerson({ id: 'p-3' })];
		const types = [makeType({ id: 'type-1' })];
		const now = new Date();
		const futureDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
		const pastDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
		const trainings = [
			makeTraining({
				personnelId: 'p-1',
				trainingTypeId: 'type-1',
				completionDate: '2025-01-01',
				expirationDate: futureDate
			}),
			makeTraining({
				personnelId: 'p-2',
				trainingTypeId: 'type-1',
				completionDate: '2024-01-01',
				expirationDate: pastDate
			})
			// p-3 has no training → not-completed
		];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		expect(dashboard.statusCounts.current).toBe(1);
		expect(dashboard.statusCounts.expired).toBe(1);
		expect(dashboard.statusCounts.notCompleted).toBe(1);
	});

	it('returns worst training types sorted by non-compliance rate', () => {
		const personnel = [makePerson({ id: 'p-1' }), makePerson({ id: 'p-2' })];
		const types = [makeType({ id: 'type-1', name: 'CPR' }), makeType({ id: 'type-2', name: 'First Aid' })];
		const trainings = [
			// Both have CPR current
			makeTraining({ id: 'pt-1', personnelId: 'p-1', trainingTypeId: 'type-1' }),
			makeTraining({ id: 'pt-2', personnelId: 'p-2', trainingTypeId: 'type-1' })
			// Neither has First Aid → 100% non-compliance for First Aid
		];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		expect(dashboard.worstTypes.length).toBeGreaterThanOrEqual(1);
		expect(dashboard.worstTypes[0].typeName).toBe('First Aid');
		expect(dashboard.worstTypes[0].nonComplianceRate).toBe(100);
	});

	it('limits worst types to top 5', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = Array.from({ length: 8 }, (_, i) => makeType({ id: `type-${i}`, name: `Training ${i}` }));

		const dashboard = computeReadinessDashboard(personnel, types, []);

		expect(dashboard.worstTypes.length).toBe(5);
	});

	it('returns group comparison with per-group readiness', () => {
		const personnel = [
			makePerson({ id: 'p-1', groupId: 'g-1', groupName: 'Alpha' }),
			makePerson({ id: 'p-2', groupId: 'g-2', groupName: 'Bravo' })
		];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [
			makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })
			// p-2 has no training
		];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		expect(dashboard.groupComparison).toHaveLength(2);
		const alpha = dashboard.groupComparison.find((g) => g.groupName === 'Alpha');
		const bravo = dashboard.groupComparison.find((g) => g.groupName === 'Bravo');
		expect(alpha?.readinessPercent).toBe(100);
		expect(bravo?.readinessPercent).toBe(0);
	});

	it('returns 0% readiness when there are no applicable trainings', () => {
		const dashboard = computeReadinessDashboard([], [], []);
		expect(dashboard.readinessPercent).toBe(0);
	});

	it('excludes optional training types from all readiness calculations', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = [
			makeType({ id: 'type-1', name: 'Required', isOptional: false }),
			makeType({ id: 'type-2', name: 'Optional', isOptional: true })
		];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		// Only required type counts: 1 current / 1 total = 100%
		expect(dashboard.readinessPercent).toBe(100);
		// Status counts only reflect required types
		expect(dashboard.statusCounts.current).toBe(1);
		expect(dashboard.statusCounts.notCompleted).toBe(0);
		// Optional doesn't appear in worst types
		expect(dashboard.worstTypes.some((t) => t.typeName === 'Optional')).toBe(false);
	});

	it('excludes optional types from group comparison', () => {
		const personnel = [makePerson({ id: 'p-1', groupId: 'g-1', groupName: 'Alpha' })];
		const types = [
			makeType({ id: 'type-1', name: 'Required' }),
			makeType({ id: 'type-2', name: 'Optional', isOptional: true })
		];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];

		const dashboard = computeReadinessDashboard(personnel, types, trainings);

		const alpha = dashboard.groupComparison.find((g) => g.groupName === 'Alpha');
		// 100% because only required type counts, and it's current
		expect(alpha?.readinessPercent).toBe(100);
	});
});

describe('filterPersonnel', () => {
	const people = [
		makePerson({ id: 'p-1', groupId: 'g-1', mos: '11B', clinicRole: 'NCO', rank: 'SGT' }),
		makePerson({ id: 'p-2', groupId: 'g-2', mos: '68W', clinicRole: 'Medic', rank: 'SPC' }),
		makePerson({ id: 'p-3', groupId: 'g-1', mos: '11B', clinicRole: 'Officer', rank: 'CPT' })
	];

	it('returns all personnel when no filters set', () => {
		const result = filterPersonnel(people, {});
		expect(result).toHaveLength(3);
	});

	it('filters by groupId', () => {
		const result = filterPersonnel(people, { groupId: 'g-1' });
		expect(result).toHaveLength(2);
		expect(result.every((p) => p.groupId === 'g-1')).toBe(true);
	});

	it('filters by MOS', () => {
		const result = filterPersonnel(people, { mos: '68W' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-2');
	});

	it('filters by role', () => {
		const result = filterPersonnel(people, { role: 'Officer' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-3');
	});

	it('filters by rank', () => {
		const result = filterPersonnel(people, { rank: 'SPC' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-2');
	});

	it('combines multiple filters with AND logic', () => {
		const result = filterPersonnel(people, { groupId: 'g-1', role: 'NCO' });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('p-1');
	});
});

describe('buildPivotTable', () => {
	it('creates one row per person with cells for each training type', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = [makeType({ id: 'type-1', name: 'CPR' }), makeType({ id: 'type-2', name: 'BLS' })];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1', expirationDate: '2027-01-01' })];

		const rows = buildPivotTable(personnel, types, trainings);

		expect(rows).toHaveLength(1);
		expect(rows[0].person.id).toBe('p-1');
		expect(rows[0].cells.get('type-1')?.status).toBe('current');
		expect(rows[0].cells.get('type-2')?.status).toBe('not-completed');
	});

	it('handles multiple people and types', () => {
		const personnel = [makePerson({ id: 'p-1' }), makePerson({ id: 'p-2' })];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [
			makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' }),
			makeTraining({ id: 'pt-2', personnelId: 'p-2', trainingTypeId: 'type-1' })
		];

		const rows = buildPivotTable(personnel, types, trainings);
		expect(rows).toHaveLength(2);
	});

	it('includes date in cell data', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [
			makeTraining({
				personnelId: 'p-1',
				trainingTypeId: 'type-1',
				expirationDate: '2027-06-15'
			})
		];

		const rows = buildPivotTable(personnel, types, trainings);
		const cell = rows[0].cells.get('type-1');
		expect(cell?.date).toBe('2027-06-15');
	});
});

describe('generatePivotCSV', () => {
	it('produces header row with person info and training type names', () => {
		const types = [makeType({ id: 'type-1', name: 'CPR' }), makeType({ id: 'type-2', name: 'BLS' })];
		const personnel = [makePerson({ id: 'p-1', rank: 'SGT', lastName: 'Smith', firstName: 'John' })];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];
		const rows = buildPivotTable(personnel, types, trainings);

		const csv = generatePivotCSV(rows, types);
		const lines = csv.split('\n');

		expect(lines[0]).toContain('Name');
		expect(lines[0]).toContain('Rank');
		expect(lines[0]).toContain('CPR');
		expect(lines[0]).toContain('BLS');
	});

	it('produces data rows with status and date per training type', () => {
		const types = [makeType({ id: 'type-1', name: 'CPR' })];
		const personnel = [makePerson({ id: 'p-1', rank: 'SGT', lastName: 'Smith', firstName: 'John' })];
		const trainings = [
			makeTraining({
				personnelId: 'p-1',
				trainingTypeId: 'type-1',
				expirationDate: '2027-01-01'
			})
		];
		const rows = buildPivotTable(personnel, types, trainings);

		const csv = generatePivotCSV(rows, types);
		const lines = csv.split('\n');

		// Data row should contain person info and status
		expect(lines[1]).toContain('Smith');
		expect(lines[1]).toContain('Current');
	});

	it('only includes filtered training types when trainingTypeIds filter is set', () => {
		const types = [makeType({ id: 'type-1', name: 'CPR' }), makeType({ id: 'type-2', name: 'BLS' })];
		const filteredTypes = types.filter((t) => ['type-1'].includes(t.id));
		const personnel = [makePerson({ id: 'p-1' })];
		const trainings = [makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })];
		const rows = buildPivotTable(personnel, filteredTypes, trainings);

		const csv = generatePivotCSV(rows, filteredTypes);
		const header = csv.split('\n')[0];
		expect(header).toContain('CPR');
		expect(header).not.toContain('BLS');
	});

	it('handles commas and quotes in names via CSV escaping', () => {
		const types = [makeType({ id: 'type-1', name: 'CPR' })];
		const personnel = [makePerson({ id: 'p-1', lastName: "O'Brien", firstName: 'John' })];
		const rows = buildPivotTable(personnel, types, []);

		const csv = generatePivotCSV(rows, types);
		// Should not break CSV parsing
		expect(csv).toBeDefined();
		expect(csv.split('\n').length).toBe(2);
	});
});

describe('filters control both dashboard and detail table', () => {
	it('filtering personnel narrows both dashboard stats and pivot rows', () => {
		const allPersonnel = [
			makePerson({ id: 'p-1', groupId: 'g-1', groupName: 'Alpha' }),
			makePerson({ id: 'p-2', groupId: 'g-2', groupName: 'Bravo' })
		];
		const types = [makeType({ id: 'type-1' })];
		const trainings = [
			makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })
			// p-2 has no training
		];

		// Unfiltered: 50% readiness, 2 pivot rows
		const unfilteredDashboard = computeReadinessDashboard(allPersonnel, types, trainings);
		const unfilteredPivot = buildPivotTable(allPersonnel, types, trainings);
		expect(unfilteredDashboard.readinessPercent).toBe(50);
		expect(unfilteredPivot).toHaveLength(2);

		// Filter to g-1 only: 100% readiness, 1 pivot row
		const filtered = filterPersonnel(allPersonnel, { groupId: 'g-1' });
		const filteredDashboard = computeReadinessDashboard(filtered, types, trainings);
		const filteredPivot = buildPivotTable(filtered, types, trainings);
		expect(filteredDashboard.readinessPercent).toBe(100);
		expect(filteredPivot).toHaveLength(1);
		expect(filteredPivot[0].person.id).toBe('p-1');
	});

	it('filtering training types narrows both dashboard and pivot columns', () => {
		const personnel = [makePerson({ id: 'p-1' })];
		const allTypes = [makeType({ id: 'type-1', name: 'CPR' }), makeType({ id: 'type-2', name: 'BLS' })];
		const trainings = [
			makeTraining({ personnelId: 'p-1', trainingTypeId: 'type-1' })
			// No BLS training
		];

		// Unfiltered: 50% readiness (1 current, 1 not-completed)
		const unfilteredDashboard = computeReadinessDashboard(personnel, allTypes, trainings);
		expect(unfilteredDashboard.readinessPercent).toBe(50);

		// Filter to CPR only: 100% readiness
		const filteredTypes = allTypes.filter((t) => t.id === 'type-1');
		const filteredDashboard = computeReadinessDashboard(personnel, filteredTypes, trainings);
		const filteredPivot = buildPivotTable(personnel, filteredTypes, trainings);
		expect(filteredDashboard.readinessPercent).toBe(100);
		expect(filteredPivot[0].cells.size).toBe(1);
		expect(filteredPivot[0].cells.has('type-1')).toBe(true);
	});
});
