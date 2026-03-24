import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { importTrainingRecords } from './trainingRecordsBatch';

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
		subscription: createTestSubscriptionPort()
	};
}

function seedTrainingType(
	ctx: TestContext,
	overrides?: Partial<{
		id: string;
		expiration_months: number | null;
		expiration_date_only: boolean;
		can_be_exempted: boolean;
		exempt_personnel_ids: string[];
	}>
) {
	const defaults = {
		id: 'tt-1',
		organization_id: 'test-org',
		name: 'Annual Rifle Qual',
		expiration_months: 12,
		expiration_date_only: false,
		can_be_exempted: false,
		exempt_personnel_ids: [],
		...overrides
	};
	ctx.store.seed('training_types', [defaults]);
	return defaults;
}

describe('importTrainingRecords', () => {
	it('inserts all valid records and logs audit event', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx);

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2025-06-01', status: 'completed' },
				{
					personnelId: 'p-2',
					trainingTypeId: 'tt-1',
					completionDate: '2025-06-15',
					status: 'completed',
					notes: 'Scored 38/40'
				}
			]
		});

		expect(result.inserted).toHaveLength(2);
		expect(result.updated).toHaveLength(0);
		expect(result.errors).toHaveLength(0);

		expect(result.inserted).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ personnelId: 'p-1', trainingTypeId: 'tt-1' }),
				expect.objectContaining({ personnelId: 'p-2', trainingTypeId: 'tt-1' })
			])
		);

		// Audit logged
		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'training.bulk_imported',
			resourceType: 'training_record',
			details: { inserted: 2, updated: 0, exempted: 0 }
		});
	});

	it('calculates expiration date from training type expiration_months', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_months: 6 });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2025-06-01', status: 'completed' }]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				completionDate: '2025-06-01',
				expirationDate: '2025-12-01'
			})
		);
	});

	it('uses completion date directly as expiration for date-only types', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_months: null, expiration_date_only: true });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2026-01-15', status: 'completed' }]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				completionDate: '2026-01-15',
				expirationDate: '2026-01-15'
			})
		);
	});

	it('errors when expiration-date-only type has no completion date', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_months: null, expiration_date_only: true });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: null, status: 'completed' }]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ index: 0, message: 'Expiration date required for this training type' });
	});

	it('handles exempt records by updating training type exempt list', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { can_be_exempted: true, exempt_personnel_ids: ['p-existing'] });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: 'p-new', trainingTypeId: 'tt-1', completionDate: null, status: 'exempt' }]
		});

		expect(result.inserted).toHaveLength(0);
		expect(result.exempted).toHaveLength(1);
		expect(result.exempted[0]).toMatchObject({ personnelId: 'p-new', trainingTypeId: 'tt-1' });
		expect(result.errors).toHaveLength(0);

		// Training type should have both existing and new personnel in exempt list
		const types = await ctx.store.findMany<{ exempt_personnel_ids: string[] }>('training_types', 'test-org');
		expect(types[0].exempt_personnel_ids).toContain('p-existing');
		expect(types[0].exempt_personnel_ids).toContain('p-new');
	});

	it('rejects exempt status when training type does not allow exemptions', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { can_be_exempted: false });

		const result = await importTrainingRecords(ctx, {
			records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: null, status: 'exempt' }]
		});

		expect(result.exempted).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ index: 0, message: 'This training type does not allow exemptions' });
	});

	it('updates existing records and inserts new ones in same batch', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_months: 12 });

		// Seed an existing training record
		ctx.store.seed('personnel_trainings', [
			{
				id: 'ptr-1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2024-01-01',
				expiration_date: '2025-01-01',
				notes: 'old notes'
			}
		]);

		const result = await importTrainingRecords(ctx, {
			records: [
				// Should UPDATE existing p-1 + tt-1
				{
					personnelId: 'p-1',
					trainingTypeId: 'tt-1',
					completionDate: '2025-06-01',
					status: 'completed',
					notes: 'new notes'
				},
				// Should INSERT new p-2 + tt-1
				{ personnelId: 'p-2', trainingTypeId: 'tt-1', completionDate: '2025-07-01', status: 'completed' }
			]
		});

		expect(result.updated).toHaveLength(1);
		expect(result.updated[0]).toEqual(
			expect.objectContaining({
				personnelId: 'p-1',
				completionDate: '2025-06-01',
				expirationDate: '2026-06-01',
				notes: 'new notes'
			})
		);

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(
			expect.objectContaining({
				personnelId: 'p-2',
				completionDate: '2025-07-01'
			})
		);

		expect(result.errors).toHaveLength(0);

		// Audit reflects both counts
		expect(ctx.auditPort.events[0]).toMatchObject({
			details: { inserted: 1, updated: 1 }
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
		seedTrainingType(ctx);

		await expect(
			importTrainingRecords(ctx, {
				records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2025-06-01', status: 'completed' }]
			})
		).rejects.toMatchObject({ status: 403 });

		// Nothing inserted
		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects when organization is in read-only mode', async () => {
		const ctx = buildContext({ readOnly: true });
		seedTrainingType(ctx);

		await expect(
			importTrainingRecords(ctx, {
				records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2025-06-01', status: 'completed' }]
			})
		).rejects.toMatchObject({ status: 403, message: 'Organization is in read-only mode' });
	});

	it('rejects empty records array', async () => {
		const ctx = buildContext();

		await expect(importTrainingRecords(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('collects per-record error for unknown training type while succeeding on valid records', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx); // tt-1 exists

		const result = await importTrainingRecords(ctx, {
			records: [
				{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2025-06-01', status: 'completed' },
				{ personnelId: 'p-2', trainingTypeId: 'tt-unknown', completionDate: '2025-06-01', status: 'completed' }
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.inserted[0]).toEqual(expect.objectContaining({ personnelId: 'p-1' }));
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toEqual({ index: 1, message: 'Training type not found' });
	});

	it('rejects when records exceed max batch size', async () => {
		const ctx = buildContext();
		const tooMany = Array.from({ length: 501 }, (_, i) => ({
			personnelId: `p-${i}`,
			trainingTypeId: 'tt-1',
			completionDate: '2025-06-01',
			status: 'completed' as const
		}));

		await expect(importTrainingRecords(ctx, { records: tooMany })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 500 records per batch'
		});
	});
});
