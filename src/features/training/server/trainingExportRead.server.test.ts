import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { listPersonnelTrainingExportRows } from './trainingExportRead.server';

const ORG = 'owned-org';

describe('Training raw export reads', () => {
	it('binds Personnel export completions to both the requested person and organization', async () => {
		const store = createInMemoryDataStore();
		const completion = {
			id: 'stored-id',
			organization_id: ORG,
			personnel_id: 'able',
			training_type_id: 'required',
			completion_date: '2026-09-22',
			expiration_date: '2027-09-22',
			notes: 'replay',
			certificate_url: null
		};
		store.seed('personnel_trainings', [
			completion,
			{ ...completion, id: 'baker-completion', personnel_id: 'baker' },
			{ ...completion, id: 'foreign-completion', organization_id: 'foreign-org' }
		]);

		expect(await listPersonnelTrainingExportRows(store, ORG, 'able')).toEqual([completion]);
		expect(await listPersonnelTrainingExportRows(store, ORG, 'missing-person')).toEqual([]);
		expect(await listPersonnelTrainingExportRows(store, 'other-org', 'able')).toEqual([]);
	});
});
