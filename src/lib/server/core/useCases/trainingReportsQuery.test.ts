import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchTrainingReportsData } from './trainingReportsQuery';

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
}

describe('fetchTrainingReportsData', () => {
	it('fetches training records from the store and returns them', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				organization_id: ORG,
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-01-01',
				expiration_date: '2027-01-01',
				notes: null,
				certificate_url: null
			}
		]);

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings).toHaveLength(1);
		expect(result.trainings[0].personnelId).toBe('p-1');
		expect(result.trainings[0].trainingTypeId).toBe('tt-1');
	});

	it('returns empty array when no training records exist', async () => {
		const ctx = buildCtx();

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings).toHaveLength(0);
	});

	it('transforms snake_case DB rows to camelCase', async () => {
		const ctx = buildCtx();
		const store = ctx.store as ReturnType<typeof createInMemoryDataStore>;

		store.seed('personnel_trainings', [
			{
				id: 'pt-1',
				organization_id: ORG,
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-03-15',
				expiration_date: '2027-03-15',
				notes: 'test note',
				certificate_url: null
			}
		]);

		const result = await fetchTrainingReportsData(ctx);

		expect(result.trainings[0].completionDate).toBe('2026-03-15');
		expect(result.trainings[0].expirationDate).toBe('2027-03-15');
		expect(result.trainings[0].notes).toBe('test note');
	});
});
