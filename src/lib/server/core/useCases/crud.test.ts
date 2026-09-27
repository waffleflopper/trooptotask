import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import type { WritePorts } from '$lib/server/core/ports';
import { createCrudUseCases } from './crud';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

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

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

const crudConfig = {
	entity: TestEntity,
	auditResource: 'test_record',
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResourceForPersonnel: async (ctx: WritePorts, personnelId: string) => {
		const person = await ctx.store.findOne<{ group_id?: string | null }>('personnel', ctx.auth.orgId, {
			id: personnelId
		});
		return person?.group_id ? { kind: 'group' as const, groupId: person.group_id } : { kind: 'organization' as const };
	}
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
			expect(ctx.audit.events).toHaveLength(1);
			expect(ctx.audit.events[0]).toMatchObject({
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

		it('allows policy-authorized writes without the legacy edit flag', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'groups', groupIds: ['group-1', 'group-2'] }
				}
			});
			ctx.store.seed('personnel', [{ id: 'p-1', organization_id: 'test-org', group_id: 'group-2', last_name: 'Able' }]);
			const { create } = createCrudUseCases({
				...crudConfig,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion
			});

			await expect(create(ctx, { personnelId: 'p-1', notes: 'done' })).resolves.toMatchObject({
				personnelId: 'p-1'
			});
		});

		it('uses create-resource policy resolution for policyAction creates without consulting privileged auth', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'groups', groupIds: ['group-2'] }
				}
			});
			ctx.store.seed('personnel', [{ id: 'p-1', organization_id: 'test-org', group_id: 'group-2', last_name: 'Able' }]);
			const { create } = createCrudUseCases({
				...crudConfig,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion
			});

			await expect(create(ctx, { personnelId: 'p-1', notes: 'done' })).resolves.toMatchObject({
				personnelId: 'p-1'
			});
		});

		it('denies policy writes outside a multi-group scope set and captures an audit event', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'groups', groupIds: ['group-1', 'group-2'] }
				}
			});
			ctx.store.seed('personnel', [
				{ id: 'p-outside', organization_id: 'test-org', group_id: 'group-3', last_name: 'Baker' }
			]);
			const { create } = createCrudUseCases({
				...crudConfig,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion
			});

			await expect(create(ctx, { personnelId: 'p-outside', notes: 'nope' })).rejects.toMatchObject({
				status: 403
			});
			expect(ctx.audit.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'test_record',
					details: expect.objectContaining({
						policyAction: 'criticalTasks.recordCompletion',
						reasonCode: 'denied:out-of-scope',
						scope: 'out-of-scope'
					})
				})
			]);
		});

		it('enforces group scope via personnelIdField', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					scopeSet: { kind: 'groups', groupIds: ['group-1'] }
				}
			});
			ctx.store.seed('personnel', [
				{ id: 'p-inside', organization_id: 'test-org', group_id: 'group-1', last_name: 'Inside' },
				{ id: 'p-outside', organization_id: 'test-org', group_id: 'group-2', last_name: 'Outside' }
			]);
			const { create } = createCrudUseCases(crudConfig);

			// Allowed personnel
			await expect(create(ctx, { personnelId: 'p-inside' })).resolves.toBeDefined();

			// Denied personnel
			await expect(create(ctx, { personnelId: 'p-outside' })).rejects.toMatchObject({ status: 403 });
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

			expect(ctx.audit.events).toHaveLength(1);
			expect(ctx.audit.events[0]).toMatchObject({
				action: 'test_record.updated',
				resourceType: 'test_record',
				resourceId: 'tr-1'
			});
		});

		it('enforces group scope by record lookup', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					scopeSet: { kind: 'groups', groupIds: ['group-1'] }
				}
			});
			const { update } = createCrudUseCases(crudConfig);

			// Seed a record that passes group scope
			ctx.store.seed('test_records', [
				{ id: 'record-inside', personnel_id: 'p-1', notes: 'old', organization_id: 'test-org' },
				{ id: 'record-outside', personnel_id: 'p-2', notes: 'old', organization_id: 'test-org' }
			]);
			ctx.store.seed('personnel', [
				{ id: 'p-1', organization_id: 'test-org', group_id: 'group-1', last_name: 'Inside' },
				{ id: 'p-2', organization_id: 'test-org', group_id: 'group-2', last_name: 'Outside' }
			]);

			await expect(update(ctx, { id: 'record-inside', notes: 'new' })).resolves.toBeDefined();
			await expect(update(ctx, { id: 'record-outside', notes: 'nope' })).rejects.toMatchObject({ status: 403 });
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

			expect(ctx.audit.events).toHaveLength(1);
			expect(ctx.audit.events[0]).toMatchObject({
				action: 'test_record.deleted',
				resourceType: 'test_record',
				resourceId: 'tr-1'
			});
		});

		it('enforces group scope by record lookup', async () => {
			const ctx = buildContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					scopeSet: { kind: 'groups', groupIds: ['group-1'] }
				}
			});
			const { remove } = createCrudUseCases(crudConfig);

			ctx.store.seed('test_records', [
				{ id: 'record-inside', personnel_id: 'p-1', notes: 'ok', organization_id: 'test-org' },
				{ id: 'record-outside', personnel_id: 'p-2', notes: 'no', organization_id: 'test-org' }
			]);
			ctx.store.seed('personnel', [
				{ id: 'p-1', organization_id: 'test-org', group_id: 'group-1', last_name: 'Inside' },
				{ id: 'p-2', organization_id: 'test-org', group_id: 'group-2', last_name: 'Outside' }
			]);

			await expect(remove(ctx, 'record-inside')).resolves.toBeUndefined();
			await expect(remove(ctx, 'record-outside')).rejects.toMatchObject({ status: 403 });
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
				beforeDelete: async (hookCtx: WritePorts, id: string) => {
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
				afterDelete: async (hookCtx: WritePorts, deletedId: string) => {
					afterDeleteCalled = true;
					// Verify record is already gone when afterDelete fires
					const record = await hookCtx.store.findOne('test_records', hookCtx.auth.orgId, {
						id: deletedId
					});
					expect(record).toBeNull();
					// Verify audit already logged
					expect(ctx.audit.events).toHaveLength(1);
				}
			};

			const { remove } = createCrudUseCases(configWithHook);
			await remove(ctx, 'tr-1');

			expect(afterDeleteCalled).toBe(true);
		});
	});
});
