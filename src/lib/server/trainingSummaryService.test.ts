import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Personnel } from '$lib/types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import { getTrainingStats } from '$features/training/utils/trainingStatus';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

// Mock PersonnelTrainingEntity.repo.list to return controlled data
const mockTrainingList = vi.fn();
vi.mock('$lib/server/entities/personnelTraining', () => ({
	PersonnelTrainingEntity: {
		repo: { list: mockTrainingList, query: vi.fn(), queryDateRange: vi.fn(), queryByIds: vi.fn() }
	}
}));

function makePersonnel(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '68W',
		clinicRole: 'medic',
		groupId: null,
		groupName: '',
		...overrides
	};
}

function makeTrainingType(overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'tt1',
		name: 'CPR/BLS',
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		requiredForRoles: ['*'],
		color: '#3b82f6',
		sortOrder: 1,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		...overrides
	};
}

function makeTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 'pt1',
		personnelId: 'p1',
		trainingTypeId: 'tt1',
		completionDate: '2026-01-01',
		expirationDate: '2027-01-01',
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

function createMockSupabase() {
	return {} as never;
}

describe('getTrainingSummary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns issues sorted by urgency: expired first, then warning-orange', async () => {
		const personnel = [makePersonnel({ id: 'p1' }), makePersonnel({ id: 'p2', lastName: 'Jones' })];
		const types = [makeTrainingType({ id: 'tt1', name: 'CPR/BLS' }), makeTrainingType({ id: 'tt2', name: 'SHARP' })];

		// p1+tt1 = expired (past expiration), p2+tt2 = warning-orange (expiring in 15 days)
		const today = new Date();
		const expiredDate = new Date(today);
		expiredDate.setDate(expiredDate.getDate() - 10);
		const warningDate = new Date(today);
		warningDate.setDate(warningDate.getDate() + 15);

		const fmt = (d: Date) => d.toISOString().split('T')[0];

		const trainings = [
			makeTraining({
				id: 'pt1',
				personnelId: 'p1',
				trainingTypeId: 'tt1',
				completionDate: '2025-01-01',
				expirationDate: fmt(expiredDate)
			}),
			makeTraining({
				id: 'pt2',
				personnelId: 'p2',
				trainingTypeId: 'tt2',
				completionDate: '2025-06-01',
				expirationDate: fmt(warningDate)
			})
		];

		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummary } = await import('./trainingSummaryService');
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types);

		// Should have issues for expired and warning-orange
		expect(result.issues.length).toBeGreaterThanOrEqual(2);
		// Expired should come first
		expect(result.issues[0].status).toBe('expired');
		expect(result.issues[0].personName).toContain('Smith');
		expect(result.issues[0].typeName).toBe('CPR/BLS');
		// Warning-orange second
		expect(result.issues[1].status).toBe('warning-orange');
		expect(result.issues[1].personName).toContain('Jones');
	});

	it('respects issueStatuses option to filter which statuses appear', async () => {
		const personnel = [makePersonnel({ id: 'p1' })];
		const types = [makeTrainingType({ id: 'tt1', name: 'CPR/BLS' }), makeTrainingType({ id: 'tt2', name: 'SHARP' })];

		const today = new Date();
		const expiredDate = new Date(today);
		expiredDate.setDate(expiredDate.getDate() - 10);
		const warningDate = new Date(today);
		warningDate.setDate(warningDate.getDate() + 15);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		const trainings = [
			makeTraining({
				id: 'pt1',
				personnelId: 'p1',
				trainingTypeId: 'tt1',
				completionDate: '2025-01-01',
				expirationDate: fmt(expiredDate)
			}),
			makeTraining({
				id: 'pt2',
				personnelId: 'p1',
				trainingTypeId: 'tt2',
				completionDate: '2025-06-01',
				expirationDate: fmt(warningDate)
			})
		];

		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummary } = await import('./trainingSummaryService');

		// Only request warning-orange, should exclude expired
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types, {
			issueStatuses: ['warning-orange']
		});

		expect(result.issues.length).toBe(1);
		expect(result.issues[0].status).toBe('warning-orange');
	});

	it('respects issueLimit to cap number of issues returned', async () => {
		// Create 3 people, each with an expired training = 3 issues. Limit to 2.
		const personnel = [
			makePersonnel({ id: 'p1', lastName: 'Alpha' }),
			makePersonnel({ id: 'p2', lastName: 'Bravo' }),
			makePersonnel({ id: 'p3', lastName: 'Charlie' })
		];
		const types = [makeTrainingType({ id: 'tt1' })];

		const expiredDate = new Date();
		expiredDate.setDate(expiredDate.getDate() - 5);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		const trainings = personnel.map((p, i) =>
			makeTraining({
				id: `pt${i}`,
				personnelId: p.id,
				trainingTypeId: 'tt1',
				completionDate: '2025-01-01',
				expirationDate: fmt(expiredDate)
			})
		);

		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummary } = await import('./trainingSummaryService');
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types, {
			issueLimit: 2
		});

		expect(result.issues.length).toBe(2);
	});

	it('includes not-completed issues when includeNotCompleted is true', async () => {
		const personnel = [makePersonnel({ id: 'p1' })];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];

		// No training record = not-completed for required training
		mockTrainingList.mockResolvedValue([]);

		const { getTrainingSummary } = await import('./trainingSummaryService');

		// Default: no not-completed
		const withoutFlag = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types);
		expect(withoutFlag.issues.length).toBe(0);

		// With flag: not-completed appears
		const withFlag = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types, {
			includeNotCompleted: true,
			issueStatuses: ['expired', 'warning-orange', 'not-completed']
		});
		expect(withFlag.issues.length).toBe(1);
		expect(withFlag.issues[0].status).toBe('not-completed');
	});

	it('returns zero stats and empty issues for empty personnel', async () => {
		mockTrainingList.mockResolvedValue([]);

		const { getTrainingSummary } = await import('./trainingSummaryService');
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, [], [makeTrainingType()]);

		expect(result.stats.total).toBe(0);
		expect(result.issues).toEqual([]);
	});

	it('returns zero stats and empty issues for no training types', async () => {
		mockTrainingList.mockResolvedValue([]);

		const { getTrainingSummary } = await import('./trainingSummaryService');
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, [makePersonnel()], []);

		expect(result.stats.total).toBe(0);
		expect(result.issues).toEqual([]);
	});

	it('returns stats matching getTrainingStats for same inputs', async () => {
		const personnel = [makePersonnel()];
		const types = [makeTrainingType()];
		const trainings = [makeTraining()];

		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummary } = await import('./trainingSummaryService');
		const result = await getTrainingSummary(createMockSupabase(), ORG_ID, personnel, types);

		const expectedStats = getTrainingStats(personnel, types, trainings);
		expect(result.stats).toEqual(expectedStats);
	});
});

const mockQueryByIds = vi.fn();
vi.mock('$lib/server/entities/personnelTraining', async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		PersonnelTrainingEntity: {
			repo: {
				list: mockTrainingList,
				query: vi.fn(),
				queryDateRange: vi.fn(),
				queryByIds: mockQueryByIds
			}
		}
	};
});

describe('getOnboardingTrainingCompletions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns correct personnelId-trainingTypeId keys for matching records', async () => {
		const trainings = [
			makeTraining({ personnelId: 'p1', trainingTypeId: 'tt1' }),
			makeTraining({ id: 'pt2', personnelId: 'p1', trainingTypeId: 'tt2' }),
			makeTraining({ id: 'pt3', personnelId: 'p2', trainingTypeId: 'tt1' })
		];
		mockQueryByIds.mockResolvedValue({ data: trainings, count: null, error: null });

		const { getOnboardingTrainingCompletions } = await import('./trainingSummaryService');
		const result = await getOnboardingTrainingCompletions(createMockSupabase(), ORG_ID, ['p1', 'p2']);

		expect(result).toBeInstanceOf(Set);
		expect(result.has('p1-tt1')).toBe(true);
		expect(result.has('p1-tt2')).toBe(true);
		expect(result.has('p2-tt1')).toBe(true);
		expect(result.size).toBe(3);
	});

	it('returns empty set when personnelIds is empty', async () => {
		const { getOnboardingTrainingCompletions } = await import('./trainingSummaryService');
		const result = await getOnboardingTrainingCompletions(createMockSupabase(), ORG_ID, []);

		expect(result).toBeInstanceOf(Set);
		expect(result.size).toBe(0);
		expect(mockQueryByIds).not.toHaveBeenCalled();
	});

	it('only queries the requested personnel IDs', async () => {
		mockQueryByIds.mockResolvedValue({ data: [], count: null, error: null });

		const { getOnboardingTrainingCompletions } = await import('./trainingSummaryService');
		await getOnboardingTrainingCompletions(createMockSupabase(), ORG_ID, ['p1', 'p3']);

		expect(mockQueryByIds).toHaveBeenCalledWith(
			expect.anything(),
			ORG_ID,
			'personnel_id',
			['p1', 'p3'],
			expect.objectContaining({ select: expect.stringContaining('personnel_id') })
		);
	});
});

describe('getTrainingSummaryByGroup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns separate summaries keyed by groupId', async () => {
		const personnel = [
			makePersonnel({ id: 'p1', groupId: 'g1' }),
			makePersonnel({ id: 'p2', lastName: 'Jones', groupId: 'g2' })
		];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];

		const today = new Date();
		const expiredDate = new Date(today);
		expiredDate.setDate(expiredDate.getDate() - 10);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		// Both personnel have expired training
		const trainings = [
			makeTraining({ id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1', expirationDate: fmt(expiredDate) }),
			makeTraining({ id: 'pt2', personnelId: 'p2', trainingTypeId: 'tt1', expirationDate: fmt(expiredDate) })
		];
		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummaryByGroup } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByGroup(createMockSupabase(), ORG_ID, personnel, types);

		expect(result).toBeInstanceOf(Map);
		expect(result.has('g1')).toBe(true);
		expect(result.has('g2')).toBe(true);
		// Each group should have 1 person's worth of stats
		expect(result.get('g1')!.stats.total).toBe(1);
		expect(result.get('g2')!.stats.total).toBe(1);
		// Each group should have issues
		expect(result.get('g1')!.issues.length).toBeGreaterThan(0);
		expect(result.get('g2')!.issues.length).toBeGreaterThan(0);
	});

	it('aggregates personnel without groupId under "ungrouped" key', async () => {
		const personnel = [
			makePersonnel({ id: 'p1', groupId: null }),
			makePersonnel({ id: 'p2', lastName: 'Jones', groupId: 'g1' })
		];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];
		mockTrainingList.mockResolvedValue([]);

		const { getTrainingSummaryByGroup } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByGroup(createMockSupabase(), ORG_ID, personnel, types);

		expect(result.has('ungrouped')).toBe(true);
		expect(result.has('g1')).toBe(true);
		expect(result.size).toBe(2);
	});

	it('applies issueLimit per group, not globally', async () => {
		const personnel = [
			makePersonnel({ id: 'p1', groupId: 'g1' }),
			makePersonnel({ id: 'p2', lastName: 'Jones', groupId: 'g1' }),
			makePersonnel({ id: 'p3', lastName: 'Doe', groupId: 'g2' }),
			makePersonnel({ id: 'p4', lastName: 'Brown', groupId: 'g2' })
		];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];

		const today = new Date();
		const expiredDate = new Date(today);
		expiredDate.setDate(expiredDate.getDate() - 10);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		// All 4 personnel have expired training
		const trainings = personnel.map((p, i) =>
			makeTraining({ id: `pt${i}`, personnelId: p.id, trainingTypeId: 'tt1', expirationDate: fmt(expiredDate) })
		);
		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummaryByGroup } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByGroup(createMockSupabase(), ORG_ID, personnel, types, {
			issueLimit: 1
		});

		// Each group should have at most 1 issue (limit per group)
		expect(result.get('g1')!.issues.length).toBe(1);
		expect(result.get('g2')!.issues.length).toBe(1);
	});
});

describe('getTrainingSummaryByType', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns per-type stats keyed by trainingTypeId', async () => {
		const personnel = [makePersonnel({ id: 'p1' })];
		const types = [
			makeTrainingType({ id: 'tt1', name: 'CPR/BLS', requiredForRoles: ['*'] }),
			makeTrainingType({ id: 'tt2', name: 'SHARP', requiredForRoles: ['*'] })
		];

		const today = new Date();
		const futureDate = new Date(today);
		futureDate.setFullYear(futureDate.getFullYear() + 1);
		const expiredDate = new Date(today);
		expiredDate.setDate(expiredDate.getDate() - 10);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		// p1 is current on tt1, expired on tt2
		const trainings = [
			makeTraining({ id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1', expirationDate: fmt(futureDate) }),
			makeTraining({ id: 'pt2', personnelId: 'p1', trainingTypeId: 'tt2', expirationDate: fmt(expiredDate) })
		];
		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummaryByType } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByType(createMockSupabase(), ORG_ID, personnel, types);

		expect(result).toBeInstanceOf(Map);
		expect(result.size).toBe(2);
		// tt1: 1 current
		expect(result.get('tt1')!.current).toBe(1);
		expect(result.get('tt1')!.expired).toBe(0);
		// tt2: 1 expired
		expect(result.get('tt2')!.expired).toBe(1);
		expect(result.get('tt2')!.current).toBe(0);
	});

	it('filters by groupId when option is provided', async () => {
		const personnel = [
			makePersonnel({ id: 'p1', groupId: 'g1' }),
			makePersonnel({ id: 'p2', lastName: 'Jones', groupId: 'g2' })
		];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];

		const futureDate = new Date();
		futureDate.setFullYear(futureDate.getFullYear() + 1);
		const fmt = (d: Date) => d.toISOString().split('T')[0];

		// Only p1 has training
		const trainings = [
			makeTraining({ id: 'pt1', personnelId: 'p1', trainingTypeId: 'tt1', expirationDate: fmt(futureDate) })
		];
		mockTrainingList.mockResolvedValue(trainings);

		const { getTrainingSummaryByType } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByType(createMockSupabase(), ORG_ID, personnel, types, {
			groupId: 'g1'
		});

		// Only p1 (g1) should be counted — 1 total, 1 current
		expect(result.get('tt1')!.total).toBe(1);
		expect(result.get('tt1')!.current).toBe(1);
	});

	it('returns not-completed stats for type with zero training records', async () => {
		const personnel = [makePersonnel({ id: 'p1' }), makePersonnel({ id: 'p2', lastName: 'Jones' })];
		const types = [makeTrainingType({ id: 'tt1', requiredForRoles: ['*'] })];

		// No training records at all
		mockTrainingList.mockResolvedValue([]);

		const { getTrainingSummaryByType } = await import('./trainingSummaryService');
		const result = await getTrainingSummaryByType(createMockSupabase(), ORG_ID, personnel, types);

		// Both personnel should be not-completed
		expect(result.get('tt1')!.total).toBe(2);
		expect(result.get('tt1')!.notCompleted).toBe(2);
		expect(result.get('tt1')!.current).toBe(0);
	});
});
