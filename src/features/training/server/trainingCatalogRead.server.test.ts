import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore, createTestContext } from '$lib/server/adapters/inMemory';
import {
	findTrainingTypeByName,
	hasTrainingTypes,
	listExistingTrainingTypeNames,
	listTrainingRankApplicabilityReferences,
	listTrainingTypeLabels,
	listTrainingTypeNamesByIds,
	listTrainingTypes,
	listTrainingViews
} from './trainingCatalogRead.server';

describe('Training catalog reads', () => {
	it('returns Organization rows in catalog order with portable applicability and saved-view shapes', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{
				id: 'required',
				organization_id: ctx.auth.orgId,
				name: 'Required',
				sort_order: 1,
				applies_to_roles: null,
				excluded_ranks: null,
				is_optional: null
			},
			{ id: 'targeted', organization_id: ctx.auth.orgId, name: 'Targeted', sort_order: 0, applies_to_mos: ['68W'] },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: 0 }
		]);
		ctx.store.seed('training_views', [
			{ id: 'view', organization_id: ctx.auth.orgId, name: 'Focus', column_ids: ['targeted', 'required'] },
			{ id: 'foreign-view', organization_id: 'other-org', name: 'Foreign', column_ids: ['foreign'] }
		]);

		const types = await listTrainingTypes(ctx.store, ctx.auth.orgId);
		expect(types.map((type) => type.id)).toEqual(['targeted', 'required']);
		expect(types[0].appliesToMos).toEqual(['68W']);
		expect(types[1]).toMatchObject({ appliesToRoles: [], excludedRanks: [], isOptional: false });
		expect(await listTrainingViews(ctx.store, ctx.auth.orgId)).toMatchObject([
			{ id: 'view', columnIds: ['targeted', 'required'] }
		]);
		expect(await listTrainingTypeLabels(ctx.store, ctx.auth.orgId)).toEqual([
			{ id: 'required', name: 'Required' },
			{ id: 'targeted', name: 'Targeted' }
		]);
		expect((await findTrainingTypeByName(ctx.store, ctx.auth.orgId, 'Targeted'))?.id).toBe('targeted');
		expect(await findTrainingTypeByName(ctx.store, ctx.auth.orgId, 'Foreign')).toBeNull();
		expect(await listExistingTrainingTypeNames(ctx.store, ctx.auth.orgId, ['Required', 'Foreign'])).toEqual([
			'Required'
		]);
		expect(await hasTrainingTypes(ctx.store, ctx.auth.orgId)).toBe(true);
		expect(await hasTrainingTypes(ctx.store, 'empty-org')).toBe(false);
	});

	it('returns only same-Organization rank applicability references for Personnel rank governance', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('training_types', [
			{
				id: 'training-1',
				organization_id: ctx.auth.orgId,
				name: 'Annual Check',
				applies_to_ranks: ['DET-SGT'],
				excluded_ranks: ['SGT']
			},
			{
				id: 'foreign',
				organization_id: 'other-org',
				name: 'Foreign',
				applies_to_ranks: ['GEN'],
				excluded_ranks: []
			}
		]);

		expect(await listTrainingRankApplicabilityReferences(ctx.rawStore, ctx.auth.orgId)).toEqual([
			{ appliesToRanks: ['DET-SGT'], excludedRanks: ['SGT'] }
		]);
	});

	it('returns only referenced Organization type names and retains the missing-name ID fallback', async () => {
		const store = createInMemoryDataStore();
		store.seed('training_types', [
			{ id: 'referenced', organization_id: 'org-1', name: 'Combat lifesaver' },
			{ id: 'missing-name', organization_id: 'org-1', name: null },
			{ id: 'unrequested', organization_id: 'org-1', name: 'Unrequested local type' },
			{ id: 'foreign', organization_id: 'org-2', name: 'Foreign type' }
		]);

		expect(
			await listTrainingTypeNamesByIds(store, 'org-1', ['referenced', 'missing-name', 'foreign', 'missing'])
		).toEqual(
			new Map([
				['referenced', 'Combat lifesaver'],
				['missing-name', 'missing-name']
			])
		);
	});

	it('returns no Training type names without accessing persistence when no IDs are referenced', async () => {
		await expect(
			listTrainingTypeNamesByIds(
				{
					async findMany() {
						throw new Error('Persistence is unavailable');
					}
				},
				'org-1',
				[]
			)
		).resolves.toEqual(new Map());
	});
});
