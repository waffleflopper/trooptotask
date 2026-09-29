import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchDashboardTrainingSummary } from './trainingSummaryQuery';

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
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
		exemptPersonnelIds: [] as string[],
		isOptional: false
	};
}

describe('Dashboard Training summary', () => {
	it('denies summary reads without Training view capability', async () => {
		const ctx = createQueryPortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(
			fetchDashboardTrainingSummary(ctx, {
				onboardingPersonnelIds: [],
				personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as never[],
				trainingTypes: [makeTrainingType('tt1')] as never[]
			})
		).rejects.toMatchObject({ status: 403 });
	});

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

		const { trainingSummary: result } = await fetchDashboardTrainingSummary(ctx, {
			onboardingPersonnelIds: [],
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

		const { trainingSummary: result } = await fetchDashboardTrainingSummary(ctx, {
			onboardingPersonnelIds: [],
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

		const { trainingSummary: result } = await fetchDashboardTrainingSummary(ctx, {
			onboardingPersonnelIds: [],
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[],
			options: { issueLimit: 1 }
		});

		expect(result.issues).toHaveLength(1);
	});

	it('returns empty stats when no trainings exist', async () => {
		const ctx = buildCtx();

		const { trainingSummary: result } = await fetchDashboardTrainingSummary(ctx, {
			onboardingPersonnelIds: [],
			personnel: [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' }] as never[],
			trainingTypes: [makeTrainingType('tt1')] as never[]
		});

		// empty applies-to = everyone, so missing training is not-completed
		expect(result.stats.notCompleted).toBe(1);
		expect(result.stats.current).toBe(0);
	});
});

describe('fetchDashboardTrainingSummary', () => {
	it('derives training summary and onboarding completion keys from a single training scan', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;
		const findManySpy = vi.spyOn(store, 'findMany');

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
				completion_date: '2025-06-01',
				expiration_date: '2027-06-01',
				notes: null,
				certificate_url: null
			}
		]);

		const personnel = [
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John', groupId: 'g1' },
			{ id: 'p2', rank: 'CPL', lastName: 'Jones', firstName: 'Jane', groupId: 'g1' }
		];
		const trainingTypes = [makeTrainingType('tt1')];

		const result = await fetchDashboardTrainingSummary(ctx, {
			personnel: personnel as never[],
			trainingTypes: trainingTypes as never[],
			onboardingPersonnelIds: ['p1', 'p2', 'missing']
		});

		expect(result.trainingSummary.stats.expired).toBe(1);
		expect(result.trainingSummary.issues).toHaveLength(1);
		expect(result.onboardingTrainingCompletions).toEqual(new Set(['p1-tt1', 'p2-tt1']));
		expect(findManySpy).toHaveBeenCalledTimes(1);
	});
});
