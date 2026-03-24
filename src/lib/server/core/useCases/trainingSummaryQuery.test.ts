import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort,
	createTestStoragePort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	fetchTrainingSummary,
	fetchTrainingSummaryByGroup,
	fetchTrainingSummaryByType,
	fetchOnboardingTrainingCompletions
} from './trainingSummaryQuery';

const ORG = 'test-org';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): UseCaseContext {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext({ orgId: ORG, ...overrides?.auth }),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort(),
		storage: createTestStoragePort()
	};
}

function makePersonnel(id: string, groupId = 'g1') {
	return {
		id,
		organization_id: ORG,
		rank: 'SGT',
		last_name: 'Smith',
		first_name: 'John',
		mos: '11B',
		clinic_role: '',
		group_id: groupId,
		groups: { name: 'Alpha' },
		archived_at: null
	};
}

function makeTrainingType(id: string, name = 'CPR') {
	return {
		id,
		name,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [] as string[],
		appliesToMos: [] as string[],
		appliesToRanks: [] as string[],
		excludedRoles: [] as string[],
		excludedMos: [] as string[],
		excludedRanks: [] as string[],
		color: '#0f0',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [] as string[]
	};
}

describe('fetchTrainingSummary', () => {
	it('fetches trainings via ctx.store and returns stats + issues', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		// Seed a training record that is current (not expired)
		const now = new Date();
		const futureDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
		const pastDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: pastDate.toISOString().split('T')[0],
				expiration_date: futureDate.toISOString().split('T')[0],
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchTrainingSummary(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[]
		});

		expect(result.stats).toBeDefined();
		expect(result.stats.current).toBe(1);
		expect(result.issues).toEqual([]);
	});

	it('returns issues for expired trainings', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchTrainingSummary(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[]
		});

		expect(result.stats.expired).toBe(1);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].personName).toBe('SGT Smith, John');
		expect(result.issues[0].status).toBe('expired');
	});

	it('respects issueLimit option', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		// Create multiple expired trainings
		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt2',
				organization_id: ORG,
				personnel_id: 'p2',
				training_type_id: 'tt1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' },
			{ id: 'p2', rank: 'CPL', lastName: 'Jones', firstName: 'Jane', groupId: 'g1' }
		];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchTrainingSummary(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[],
			options: { issueLimit: 1 }
		});

		expect(result.issues).toHaveLength(1);
	});

	it('returns empty stats when no trainings exist', async () => {
		const ctx = buildCtx();

		const result = await fetchTrainingSummary(ctx, {
			personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as never[],
			trainingTypes: [makeTrainingType('tt1')] as never[]
		});

		// empty applies-to = everyone, so missing training is not-completed
		expect(result.stats.notCompleted).toBe(1);
		expect(result.stats.current).toBe(0);
	});
});

describe('fetchTrainingSummaryByGroup', () => {
	it('returns summaries keyed by groupId', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' },
			{ id: 'p2', rank: 'CPL', lastName: 'Jones', firstName: 'Jane', groupId: 'g2' }
		];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchTrainingSummaryByGroup(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[]
		});

		expect(result).toBeInstanceOf(Map);
		expect(result.has('g1')).toBe(true);
		expect(result.has('g2')).toBe(true);
		expect(result.get('g1')!.stats.current).toBe(1);
	});
});

describe('fetchTrainingSummaryByType', () => {
	it('returns stats keyed by training type id', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }];
		const trainingTypes = [makeTrainingType('tt1'), makeTrainingType('tt2', 'First Aid')];

		const result = await fetchTrainingSummaryByType(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[]
		});

		expect(result).toBeInstanceOf(Map);
		expect(result.has('tt1')).toBe(true);
		expect(result.has('tt2')).toBe(true);
		expect(result.get('tt1')!.current).toBe(1);
	});
});

describe('fetchOnboardingTrainingCompletions', () => {
	it('returns set of personnelId-trainingTypeId completion keys', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt2',
				organization_id: ORG,
				personnel_id: 'p2',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const result = await fetchOnboardingTrainingCompletions(ctx, { personnelIds: ['p1', 'p2'] });

		expect(result).toBeInstanceOf(Set);
		expect(result.has('p1-tt1')).toBe(true);
		expect(result.has('p2-tt1')).toBe(true);
	});

	it('returns empty set for empty personnelIds', async () => {
		const ctx = buildCtx();

		const result = await fetchOnboardingTrainingCompletions(ctx, { personnelIds: [] });

		expect(result).toBeInstanceOf(Set);
		expect(result.size).toBe(0);
	});

	it('filters to only requested personnelIds', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt2',
				organization_id: ORG,
				personnel_id: 'p3',
				training_type_id: 'tt1',
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const result = await fetchOnboardingTrainingCompletions(ctx, { personnelIds: ['p1'] });

		expect(result.has('p1-tt1')).toBe(true);
		expect(result.has('p3-tt1')).toBe(false);
	});
});
