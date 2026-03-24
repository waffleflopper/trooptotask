import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createCrudUseCases } from './crud';

// Minimal test entity — like a simplified training record
interface TestRecord {
	id: string;
	personnelId: string;
	notes: string;
}

const TestEntity = defineEntity<TestRecord>({
	table: 'test_records',
	groupScope: { personnelColumn: 'personnel_id' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
		notes: field(z.string().nullable(), { insertDefault: null })
	}
});

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	subscription: ReturnType<typeof createTestSubscriptionPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	const subscription = createTestSubscriptionPort();
	return {
		store,
		rawStore: store,
		auth,
		audit: auditPort,
		readOnlyGuard,
		subscription,
		auditPort,
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort()
	};
}

const crudConfig = {
	entity: TestEntity,
	permission: 'training' as const,
	auditResource: 'test_record'
};

describe('createCrudUseCases', () => {
	describe('create', () => {
		it('validates input, inserts into DataStore, audits, and returns transformed result', async () => {
			const ctx = buildContext();
			const { create } = createCrudUseCases(crudConfig);

			const result = await create(ctx, { personnelId: 'p-1', notes: 'hello' });

			expect(result).toMatchObject({ personnelId: 'p-1', notes: 'hello' });

			// Verify it was persisted
			const stored = await ctx.store.findOne('test_records', 'test-org', { personnel_id: 'p-1' });
			expect(stored).not.toBeNull();

			// Verify audit was logged
			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0]).toMatchObject({
				action: 'test_record.created',
				resourceType: 'test_record'
			});
		});

		it('rejects invalid input via entity Zod schema', async () => {
			const ctx = buildContext();
			const { create } = createCrudUseCases(crudConfig);

			// personnelId is required but missing
			await expect(create(ctx, { notes: 'no personnel' })).rejects.toThrow();
		});

		it('throws when user lacks edit permission', async () => {
			const ctx = buildContext({
				auth: {
					requireEdit() {
						throw new Error('No edit permission');
					}
				}
			});
			const { create } = createCrudUseCases(crudConfig);

			await expect(create(ctx, { personnelId: 'p-1' })).rejects.toThrow('No edit permission');
			// Should not have inserted anything
			const stored = await ctx.store.findMany('test_records', 'test-org');
			expect(stored).toHaveLength(0);
		});

		it('throws when organization is read-only', async () => {
			const ctx = buildContext({ readOnly: true });
			const { create } = createCrudUseCases(crudConfig);

			await expect(create(ctx, { personnelId: 'p-1' })).rejects.toMatchObject({
				status: 403,
				message: 'Organization is in read-only mode'
			});
			const stored = await ctx.store.findMany('test_records', 'test-org');
			expect(stored).toHaveLength(0);
		});

		it('enforces group scope via personnelIdField', async () => {
			const ctx = buildContext({
				auth: {
					scopedGroupId: 'group-1',
					async requireGroupAccess(personnelId: string) {
						if (personnelId === 'p-outside') {
							throw new Error('Access denied: personnel not in group');
						}
					}
				}
			});
			const { create } = createCrudUseCases(crudConfig);

			// Allowed personnel
			await expect(create(ctx, { personnelId: 'p-inside' })).resolves.toBeDefined();

			// Denied personnel
			await expect(create(ctx, { personnelId: 'p-outside' })).rejects.toThrow('Access denied');
		});
	});

	describe('update', () => {
		it('validates input, updates in DataStore, audits, and returns transformed result', async () => {
			const ctx = buildContext();
			const { update } = createCrudUseCases(crudConfig);

			// Seed existing record directly (simulates pre-existing DB row)
			ctx.store.seed('test_records', [
				{ id: 'tr-1', personnel_id: 'p-1', notes: 'original', organization_id: 'test-org' }
			]);

			const result = await update(ctx, { id: 'tr-1', notes: 'updated' });
			expect(result).toMatchObject({ notes: 'updated' });

			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0]).toMatchObject({
				action: 'test_record.updated',
				resourceType: 'test_record',
				resourceId: 'tr-1'
			});
		});

		it('throws when user lacks edit permission', async () => {
			const ctx = buildContext({
				auth: {
					requireEdit() {
						throw new Error('No edit permission');
					}
				}
			});
			const { update } = createCrudUseCases(crudConfig);

			await expect(update(ctx, { id: 'some-id', notes: 'nope' })).rejects.toThrow('No edit permission');
		});

		it('throws when organization is read-only', async () => {
			const ctx = buildContext({ readOnly: true });
			const { update } = createCrudUseCases(crudConfig);

			await expect(update(ctx, { id: 'some-id', notes: 'nope' })).rejects.toMatchObject({
				status: 403
			});
		});

		it('enforces group scope by record lookup', async () => {
			const ctx = buildContext({
				auth: {
					async requireGroupAccessByRecord(table: string, recordId: string) {
						if (recordId === 'record-outside') {
							throw new Error('Access denied: record not in group');
						}
					}
				}
			});
			const { update } = createCrudUseCases(crudConfig);

			// Seed a record that passes group scope
			ctx.store.seed('test_records', [
				{ id: 'record-inside', personnel_id: 'p-1', notes: 'old', organization_id: 'test-org' }
			]);

			await expect(update(ctx, { id: 'record-inside', notes: 'new' })).resolves.toBeDefined();
			await expect(update(ctx, { id: 'record-outside', notes: 'nope' })).rejects.toThrow('Access denied');
		});
	});

	describe('remove', () => {
		it('deletes from DataStore and audits', async () => {
			const ctx = buildContext();
			const { remove } = createCrudUseCases(crudConfig);

			ctx.store.seed('test_records', [
				{ id: 'tr-1', personnel_id: 'p-1', notes: 'doomed', organization_id: 'test-org' }
			]);

			await remove(ctx, 'tr-1');

			const stored = await ctx.store.findOne('test_records', 'test-org', { id: 'tr-1' });
			expect(stored).toBeNull();

			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0]).toMatchObject({
				action: 'test_record.deleted',
				resourceType: 'test_record',
				resourceId: 'tr-1'
			});
		});

		it('throws when user lacks edit permission', async () => {
			const ctx = buildContext({
				auth: {
					requireEdit() {
						throw new Error('No edit permission');
					}
				}
			});
			const { remove } = createCrudUseCases(crudConfig);

			await expect(remove(ctx, 'tr-1')).rejects.toThrow('No edit permission');
		});

		it('throws when organization is read-only', async () => {
			const ctx = buildContext({ readOnly: true });
			const { remove } = createCrudUseCases(crudConfig);

			await expect(remove(ctx, 'tr-1')).rejects.toMatchObject({ status: 403 });
		});

		it('enforces group scope by record lookup', async () => {
			const ctx = buildContext({
				auth: {
					async requireGroupAccessByRecord(table: string, recordId: string) {
						if (recordId === 'record-outside') {
							throw new Error('Access denied: record not in group');
						}
					}
				}
			});
			const { remove } = createCrudUseCases(crudConfig);

			ctx.store.seed('test_records', [
				{ id: 'record-inside', personnel_id: 'p-1', notes: 'ok', organization_id: 'test-org' }
			]);

			await expect(remove(ctx, 'record-inside')).resolves.toBeUndefined();
			await expect(remove(ctx, 'record-outside')).rejects.toThrow('Access denied');
		});
	});

	describe('requireFullEditor', () => {
		const fullEditorConfig = {
			...crudConfig,
			requireFullEditor: true
		};

		it('calls requireFullEditor on create when configured', async () => {
			const ctx = buildContext({
				auth: {
					requireFullEditor() {
						throw new Error('Requires full editor');
					}
				}
			});
			const { create } = createCrudUseCases(fullEditorConfig);

			await expect(create(ctx, { personnelId: 'p-1' })).rejects.toThrow('Requires full editor');
		});

		it('calls requireFullEditor on update when configured', async () => {
			const ctx = buildContext({
				auth: {
					requireFullEditor() {
						throw new Error('Requires full editor');
					}
				}
			});
			const { update } = createCrudUseCases(fullEditorConfig);

			await expect(update(ctx, { id: 'tr-1', notes: 'x' })).rejects.toThrow('Requires full editor');
		});

		it('calls requireFullEditor on remove when configured', async () => {
			const ctx = buildContext({
				auth: {
					requireFullEditor() {
						throw new Error('Requires full editor');
					}
				}
			});
			const { remove } = createCrudUseCases(fullEditorConfig);

			await expect(remove(ctx, 'tr-1')).rejects.toThrow('Requires full editor');
		});

		it('does not call requireFullEditor when not configured', async () => {
			let fullEditorCalled = false;
			const ctx = buildContext({
				auth: {
					requireFullEditor() {
						fullEditorCalled = true;
					}
				}
			});
			const { create } = createCrudUseCases(crudConfig);

			await create(ctx, { personnelId: 'p-1' });
			expect(fullEditorCalled).toBe(false);
		});
	});

	describe('beforeDelete hook', () => {
		it('calls beforeDelete before deleting the record', async () => {
			const callOrder: string[] = [];
			const ctx = buildContext();

			ctx.store.seed('test_records', [{ id: 'tr-1', personnel_id: 'p-1', notes: 'x', organization_id: 'test-org' }]);
			// Seed a related record to cascade-delete
			ctx.store.seed('related_items', [{ id: 'rel-1', test_record_id: 'tr-1', organization_id: 'test-org' }]);

			const configWithHook = {
				...crudConfig,
				beforeDelete: async (hookCtx: UseCaseContext, id: string) => {
					callOrder.push('beforeDelete');
					await hookCtx.store.deleteWhere('related_items', hookCtx.auth.orgId, {
						test_record_id: id
					});
				}
			};

			const { remove } = createCrudUseCases(configWithHook);
			await remove(ctx, 'tr-1');

			// Related items should be cascade-deleted
			const related = await ctx.store.findMany('related_items', 'test-org');
			expect(related).toHaveLength(0);

			// Main record should also be deleted
			const main = await ctx.store.findOne('test_records', 'test-org', { id: 'tr-1' });
			expect(main).toBeNull();
		});
	});

	describe('afterDelete hook', () => {
		it('calls afterDelete after deleting and auditing', async () => {
			const ctx = buildContext();

			ctx.store.seed('test_records', [{ id: 'tr-1', personnel_id: 'p-1', notes: 'x', organization_id: 'test-org' }]);

			let afterDeleteCalled = false;
			const configWithHook = {
				...crudConfig,
				afterDelete: async (hookCtx: UseCaseContext, deletedId: string) => {
					afterDeleteCalled = true;
					// Verify record is already gone when afterDelete fires
					const record = await hookCtx.store.findOne('test_records', hookCtx.auth.orgId, {
						id: deletedId
					});
					expect(record).toBeNull();
					// Verify audit already logged
					expect(ctx.auditPort.events).toHaveLength(1);
				}
			};

			const { remove } = createCrudUseCases(configWithHook);
			await remove(ctx, 'tr-1');

			expect(afterDeleteCalled).toBe(true);
		});
	});
});
