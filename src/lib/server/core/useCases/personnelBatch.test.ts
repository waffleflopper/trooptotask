import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort
} from '$lib/server/adapters/inMemory';
import { importPersonnelBatch } from './personnelBatch';

function buildContext(overrides?: {
	readOnly?: boolean;
	auth?: Parameters<typeof createTestAuthContext>[0];
	subscriptionAllowed?: boolean;
	availableSlots?: number | null;
}) {
	return {
		ctx: {
			store: createInMemoryDataStore(),
			auth: createTestAuthContext(overrides?.auth),
			audit: createTestAuditPort(),
			readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly)
		},
		subscription: createTestSubscriptionPort(
			overrides?.subscriptionAllowed ?? true,
			undefined,
			overrides?.availableSlots ?? null
		)
	};
}

describe('importPersonnelBatch', () => {
	it('rejects empty records array', async () => {
		const { ctx, subscription } = buildContext();
		await expect(importPersonnelBatch(ctx, subscription, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('rejects batches over 500 records', async () => {
		const { ctx, subscription } = buildContext();
		const records = Array.from({ length: 501 }, (_, i) => ({
			rank: 'SGT',
			lastName: `Last${i}`,
			firstName: `First${i}`
		}));
		await expect(importPersonnelBatch(ctx, subscription, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});

	it('blocks when read-only', async () => {
		const { ctx, subscription } = buildContext({ readOnly: true });
		await expect(
			importPersonnelBatch(ctx, subscription, {
				records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('returns per-record errors for invalid ranks', async () => {
		const { ctx, subscription } = buildContext();
		const result = await importPersonnelBatch(ctx, subscription, {
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
		const { ctx, subscription } = buildContext();
		const result = await importPersonnelBatch(ctx, subscription, {
			records: [{ rank: '', lastName: 'Smith', firstName: 'John' }]
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('required');
	});

	it('trims batch when near subscription cap', async () => {
		const { ctx, subscription } = buildContext({ availableSlots: 1 });
		const result = await importPersonnelBatch(ctx, subscription, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'John' },
				{ rank: 'PFC', lastName: 'Doe', firstName: 'Jane' }
			]
		});
		expect(result.inserted).toHaveLength(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toContain('cap reached');
	});

	it('returns error when cap fully reached (0 available)', async () => {
		const { ctx, subscription } = buildContext({ availableSlots: 0 });
		const result = (await importPersonnelBatch(ctx, subscription, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
		})) as { inserted: unknown[]; errors: unknown[]; error?: string };
		expect(result.inserted).toHaveLength(0);
		expect(result.error).toContain('Personnel limit reached');
	});

	it('enforces scoped group restriction', async () => {
		const { ctx, subscription } = buildContext({
			auth: { scopedGroupId: 'group-1' }
		});
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, subscription, {
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
		const { ctx, subscription } = buildContext();
		await importPersonnelBatch(ctx, subscription, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
		});
		expect(subscription.tierCacheInvalidated).toBe(true);
	});

	it('logs audit event with count', async () => {
		const { ctx, subscription } = buildContext();
		await importPersonnelBatch(ctx, subscription, {
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
		const { ctx, subscription } = buildContext();

		// Seed groups for name matching
		ctx.store.seed('groups', [{ id: 'group-1', organization_id: 'test-org', name: 'Alpha' }]);

		const result = await importPersonnelBatch(ctx, subscription, {
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
