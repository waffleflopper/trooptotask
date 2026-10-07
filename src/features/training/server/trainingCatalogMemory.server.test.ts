import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';

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

		const types = await ctx.trainingCatalog.listTypes();
		expect(types.map((type) => type.id)).toEqual(['targeted', 'required']);
		expect(types[0].appliesToMos).toEqual(['68W']);
		expect(types[1]).toMatchObject({ appliesToRoles: [], excludedRanks: [], isOptional: false });
		expect(await ctx.trainingCatalog.listViews()).toMatchObject([{ id: 'view', columnIds: ['targeted', 'required'] }]);
		expect(await ctx.trainingCatalog.listTypeLabels()).toEqual([
			{ id: 'required', name: 'Required' },
			{ id: 'targeted', name: 'Targeted' }
		]);
		expect((await ctx.trainingCatalog.findTypeByName('Targeted'))?.id).toBe('targeted');
		expect(await ctx.trainingCatalog.findTypeByName('Foreign')).toBeNull();
		expect(await ctx.trainingCatalog.listExistingTypeNames(['Required', 'Foreign'])).toEqual(['Required']);
		expect(await ctx.trainingCatalog.hasTypes()).toBe(true);
		expect(await createTestContext({ auth: { orgId: 'empty-org' } }).trainingCatalog.hasTypes()).toBe(false);
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

		expect(await ctx.trainingCatalog.listRankApplicabilityReferences()).toEqual([
			{ appliesToRanks: ['DET-SGT'], excludedRanks: ['SGT'] }
		]);
	});
});
