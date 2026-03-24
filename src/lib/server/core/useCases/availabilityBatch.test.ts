import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createAvailabilityBatch, deleteAvailabilityBatch } from './availabilityBatch';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const auditPort = createTestAuditPort();
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext(overrides?.auth),
		audit: auditPort,
		auditPort,
		readOnlyGuard: createTestReadOnlyGuard(overrides?.readOnly ?? false),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort()
	};
}

describe('createAvailabilityBatch', () => {
	const validRecords = [
		{ personnelId: 'p-1', statusTypeId: 'st-1', startDate: '2025-04-01', endDate: '2025-04-05' },
		{ personnelId: 'p-2', statusTypeId: 'st-2', startDate: '2025-04-02', endDate: '2025-04-06', note: 'TDY' }
	];

	it('inserts records, transforms result, and logs audit event', async () => {
		const ctx = buildContext();

		const result = await createAvailabilityBatch(ctx, { records: validRecords });

		// Returns inserted records in camelCase
		expect(result.inserted).toHaveLength(2);
		expect(result.inserted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					personnelId: 'p-1',
					statusTypeId: 'st-1',
					startDate: '2025-04-01',
					endDate: '2025-04-05'
				}),
				expect.objectContaining({
					personnelId: 'p-2',
					statusTypeId: 'st-2',
					startDate: '2025-04-02',
					endDate: '2025-04-06',
					note: 'TDY'
				})
			])
		);

		// Data persisted in store
		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(2);

		// Audit logged with count
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'availability.bulk_created',
			resourceType: 'availability',
			details: { count: 2 }
		});
	});

	it('rejects empty records array', async () => {
		const ctx = buildContext();

		await expect(createAvailabilityBatch(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects when records exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => ({
			personnelId: `p-${i}`,
			statusTypeId: 'st-1',
			startDate: '2025-04-01',
			endDate: '2025-04-05'
		}));

		await expect(createAvailabilityBatch(ctx, { records: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});

	it('enforces group scope on all personnel IDs in the batch', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch() {
					throw groupAccessError;
				}
			}
		});

		await expect(createAvailabilityBatch(ctx, { records: validRecords })).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('availability_entries', 'test-org');
		expect(stored).toHaveLength(0);
	});
});

describe('deleteAvailabilityBatch', () => {
	function seedEntries(ctx: TestContext) {
		ctx.store.seed('availability_entries', [
			{
				id: 'e-1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				status_type_id: 'st-1',
				start_date: '2025-04-01',
				end_date: '2025-04-05'
			},
			{
				id: 'e-2',
				organization_id: 'test-org',
				personnel_id: 'p-2',
				status_type_id: 'st-2',
				start_date: '2025-04-02',
				end_date: '2025-04-06'
			},
			{
				id: 'e-keep',
				organization_id: 'test-org',
				personnel_id: 'p-3',
				status_type_id: 'st-1',
				start_date: '2025-04-03',
				end_date: '2025-04-07'
			}
		]);
	}

	it('deletes entries by IDs, audits, and returns count', async () => {
		const ctx = buildContext();
		seedEntries(ctx);

		const result = await deleteAvailabilityBatch(ctx, { ids: ['e-1', 'e-2'] });

		expect(result).toEqual({ deleted: 2 });

		// Only e-keep remains
		const remaining = await ctx.store.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'availability.bulk_deleted',
			resourceType: 'availability',
			details: { count: 2 }
		});
	});

	it('rejects empty IDs array', async () => {
		const ctx = buildContext();

		await expect(deleteAvailabilityBatch(ctx, { ids: [] })).rejects.toMatchObject({
			status: 400,
			message: 'ids array is required'
		});
	});

	it('rejects when IDs exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => `id-${i}`);

		await expect(deleteAvailabilityBatch(ctx, { ids: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 ids per batch'
		});
	});

	it('enforces group scope by looking up personnel from entries', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch() {
					throw groupAccessError;
				}
			}
		});
		seedEntries(ctx);

		await expect(deleteAvailabilityBatch(ctx, { ids: ['e-1', 'e-2'] })).rejects.toMatchObject({ status: 403 });

		// Nothing deleted
		const remaining = await ctx.store.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(3);
	});
});
