import { describe, it, expect } from 'vitest';
import { createWriteWithSubscriptionPortsContext } from '$lib/server/adapters/inMemory';
import { importPersonnelBatch } from './personnelBatch';

function buildContext(overrides?: Parameters<typeof createWriteWithSubscriptionPortsContext>[0]) {
	return createWriteWithSubscriptionPortsContext(overrides);
}

describe('importPersonnelBatch', () => {
	it('rejects empty records array', async () => {
		const ctx = buildContext();
		await expect(importPersonnelBatch(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('rejects batches over 500 records', async () => {
		const ctx = buildContext();
		const records = Array.from({ length: 501 }, (_, i) => ({
			rank: 'SGT',
			lastName: `Last${i}`,
			firstName: `First${i}`
		}));
		await expect(importPersonnelBatch(ctx, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});

	it('blocks when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(
			importPersonnelBatch(ctx, {
				records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('returns per-record errors for invalid ranks', async () => {
		const ctx = buildContext();
		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'INVALID', lastName: 'Smith', firstName: 'John' },
				{ rank: 'SGT', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ index: 0, message: 'Invalid rank "INVALID"' });
	});

	it('returns errors for missing required fields', async () => {
		const ctx = buildContext();
		const result = await importPersonnelBatch(ctx, {
			records: [{ rank: '', lastName: 'Smith', firstName: 'John' }]
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('required');
	});

	it('trims batch when near subscription cap', async () => {
		const ctx = buildContext({ availableSlots: 1 });
		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('cap reached');
		expect(result.errors[0].message).toContain('upgrade or archive personnel');
	});

	it('returns per-row errors when cap is fully reached', async () => {
		const ctx = buildContext({ availableSlots: 0 });

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toEqual([
			{ index: 0, message: 'Personnel cap reached — upgrade or archive personnel before adding this record' },
			{ index: 1, message: 'Personnel cap reached — upgrade or archive personnel before adding this record' }
		]);
	});

	it('enforces scoped group restriction', async () => {
		const ctx = buildContext({
			auth: { scopeSet: { kind: 'groups', groupIds: ['group-1'] } }
		});
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John', groupName: 'Alpha' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' } // no group — won't match scoped group
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('only add personnel to your assigned group');
	});

	it('invalidates tier cache after insert', async () => {
		const ctx = buildContext();
		await importPersonnelBatch(ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
		});
		expect(ctx.subscription.tierCacheInvalidated).toBe(true);
	});

	it('preserves ETS and DEROS values from bulk import records', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'John',
					ets: '2027-05-01',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.errors).toHaveLength(0);
		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toMatchObject({
			ets: '2027-05-01',
			deros: '2026-11-30'
		});

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel[0]).toMatchObject({
			ets: '2027-05-01',
			deros: '2026-11-30'
		});
	});

	it('generates unique Personnel Slugs for imported records', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'SSG', lastName: 'Smith', firstName: 'John' }
			]
		});

		expect(result.inserted).toMatchObject([{ slug: 'smith-john' }, { slug: 'smith-john-2' }]);

		const personnel = (await ctx.store.findMany('personnel', 'test-org')) as Record<string, unknown>[];
		expect(personnel.map((person) => person.slug)).toEqual(['smith-john', 'smith-john-2']);
	});

	it('rejects malformed ETS and DEROS date strings during bulk import', async () => {
		const ctx = buildContext();

		const result = await importPersonnelBatch(ctx, {
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'John',
					ets: '12/25/2026'
				},
				{
					rank: 'PFC',
					lastName: 'Doe',
					firstName: 'Jane',
					deros: '2026-02-30'
				}
			]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toEqual([
			{ index: 0, message: 'ETS must be a valid YYYY-MM-DD date' },
			{ index: 1, message: 'DEROS must be a valid YYYY-MM-DD date' }
		]);

		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(0);
	});

	it('logs audit event with count', async () => {
		const ctx = buildContext();
		await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.bulk_created',
			resourceType: 'personnel',
			details: { count: 2 }
		});
	});

	it('validates and inserts valid records', async () => {
		const ctx = buildContext();

		// Seed groups for name matching
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John', groupName: 'Alpha' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});

		expect(result.inserted).toHaveLength(2);
		expect(result.errors).toHaveLength(0);

		// Verify records in store
		const personnel = await ctx.store.findMany('personnel', 'test-org');
		expect(personnel).toHaveLength(2);
	});
});
