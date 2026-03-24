import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { calculateExpirationDate, createTrainingRecord, deleteTrainingRecord } from './trainingRecords';

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
	}>
) {
	ctx.store.seed('training_types', [
		{
			id: overrides?.id ?? 'tt-1',
			organization_id: 'test-org',
			expiration_months: overrides?.expiration_months !== undefined ? overrides.expiration_months : 12,
			expiration_date_only: overrides?.expiration_date_only ?? false
		}
	]);
}

describe('calculateExpirationDate', () => {
	it('returns date offset by expiration months from completion date', () => {
		const result = calculateExpirationDate('2025-03-15', 12);
		expect(result).toBe('2026-03-15');
	});

	it('returns null when expiration months is null', () => {
		expect(calculateExpirationDate('2025-03-15', null)).toBeNull();
	});

	it('returns null when completion date is null', () => {
		expect(calculateExpirationDate(null, 12)).toBeNull();
	});
});

describe('createTrainingRecord', () => {
	const validInput = {
		personnelId: 'p-1',
		trainingTypeId: 'tt-1',
		completionDate: '2025-03-15',
		notes: null,
		certificateUrl: null
	};

	it('looks up training type, calculates expiration, inserts, and audits', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx);

		const result = (await createTrainingRecord(ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: '2025-03-15',
			expirationDate: '2026-03-15'
		});

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'training_record.created',
			resourceType: 'training_record'
		});
	});

	it('uses client-provided expiration date for expirationDateOnly types', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_date_only: true, expiration_months: null });

		const result = (await createTrainingRecord(ctx, {
			...validInput,
			completionDate: null,
			expirationDate: '2027-06-01'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			expirationDate: '2027-06-01'
		});
	});

	it('sets null expiration when type has no expiration months', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx, { expiration_months: null });

		const result = (await createTrainingRecord(ctx, validInput)) as Record<string, unknown>;
		expect(result.expirationDate).toBeNull();
	});

	it('upserts: updates existing record instead of creating duplicate', async () => {
		const ctx = buildContext();
		seedTrainingType(ctx);

		await createTrainingRecord(ctx, validInput);
		const result = (await createTrainingRecord(ctx, {
			...validInput,
			completionDate: '2025-06-01'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			completionDate: '2025-06-01',
			expirationDate: '2026-06-01'
		});

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events[1]).toMatchObject({
			action: 'training_record.updated'
		});
	});

	it('rejects when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedTrainingType(ctx);

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 403 });
	});

	it('enforces group scope on personnel', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});
		seedTrainingType(ctx);

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 403 });
	});

	it('errors when training type not found', async () => {
		const ctx = buildContext();
		// no training type seeded

		await expect(createTrainingRecord(ctx, validInput)).rejects.toMatchObject({ status: 404 });
	});
});

describe('deleteTrainingRecord', () => {
	function seedRecord(ctx: TestContext) {
		ctx.store.seed('personnel_trainings', [
			{
				id: 'tr-1',
				organization_id: 'test-org',
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2025-03-15',
				expiration_date: '2026-03-15',
				notes: null,
				certificate_url: null
			}
		]);
	}

	it('deletes record and audits', async () => {
		const ctx = buildContext();
		seedRecord(ctx);

		await deleteTrainingRecord(ctx, 'tr-1');

		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(0);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'training_record.deleted',
			resourceType: 'training_record',
			resourceId: 'tr-1'
		});
	});

	it('enforces group scope via record lookup', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessByRecord() {
					throw groupAccessError;
				}
			}
		});
		seedRecord(ctx);

		await expect(deleteTrainingRecord(ctx, 'tr-1')).rejects.toMatchObject({ status: 403 });
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: { isPrivileged: false, isFullEditor: false, role: 'member' }
		});
		seedRecord(ctx);

		const result = await deleteTrainingRecord(ctx, 'tr-1');
		expect(result).toMatchObject({ requiresApproval: true });

		// Record should NOT be deleted
		const stored = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(stored).toHaveLength(1);
	});
});
