import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import {
	listPersonnelTrainingExportRows,
	listTrainingCompletionExportRows,
	listTrainingTypeExportRows,
	listTrainingViewExportRows
} from './trainingExportRead.server';

const ORG = 'owned-org';

describe('Training raw export reads', () => {
	it('retains raw catalog, completion and view fields while excluding foreign organization rows', async () => {
		const store = createInMemoryDataStore();
		const type = {
			id: 'required',
			organization_id: ORG,
			name: 'Required',
			expiration_months: 12,
			exempt_personnel_ids: ['exempt-person'],
			created_at: '2026-09-29T12:00:00Z',
			retained_extra: { source: 'catalog' }
		};
		const completion = {
			id: 'stored-completion',
			organization_id: ORG,
			personnel_id: 'able',
			training_type_id: 'required',
			completion_date: null,
			expiration_date: '2026-10-14',
			notes: 'saved notes',
			certificate_url: 'https://example.invalid/certificate',
			updated_at: '2026-09-29T12:00:00Z',
			retained_extra: 'completion'
		};
		const view = {
			id: 'saved-view',
			organization_id: ORG,
			name: 'Saved view',
			column_order: ['required'],
			visible_type_ids: ['required'],
			retained_extra: { source: 'view' }
		};
		store.seed('training_types', [type, { ...type, id: 'foreign-type', organization_id: 'foreign-org' }]);
		store.seed('personnel_trainings', [
			completion,
			{ ...completion, id: 'foreign-record', organization_id: 'foreign-org' }
		]);
		store.seed('training_views', [view, { ...view, id: 'foreign-view', organization_id: 'foreign-org' }]);

		expect(await listTrainingTypeExportRows(store, ORG)).toEqual([type]);
		expect(await listTrainingCompletionExportRows(store, ORG)).toEqual([completion]);
		expect(await listTrainingViewExportRows(store, ORG)).toEqual([view]);
	});

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
