import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createCrudUseCases } from './crud';
import { statusTypeCrudConfig } from './statusTypeCrud';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, auth, audit: auditPort, readOnlyGuard, auditPort };
}

describe('StatusType CRUD use case', () => {
	it('creates a status type and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(statusTypeCrudConfig);

		const result = (await create(ctx, {
			name: 'On Leave',
			color: '#00ff00',
			textColor: '#000000',
			sortOrder: 1
		})) as { name: string };

		expect(result).toMatchObject({ name: 'On Leave' });
		expect(ctx.auditPort.events[0].action).toBe('status_type.created');
	});

	it('cascade-deletes availability_entries before deleting status type', async () => {
		const ctx = buildContext();
		ctx.store.seed('status_types', [
			{
				id: 'st-1',
				name: 'On Leave',
				color: '#00ff00',
				text_color: '#000000',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('availability_entries', [
			{ id: 'ae-1', status_type_id: 'st-1', organization_id: 'test-org' },
			{ id: 'ae-2', status_type_id: 'st-1', organization_id: 'test-org' },
			{ id: 'ae-3', status_type_id: 'st-other', organization_id: 'test-org' }
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		const { remove } = createCrudUseCases(statusTypeCrudConfig);
		await remove(ctx, 'st-1');

		// Related availability entries for st-1 should be deleted
		const remaining = await ctx.store.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).status_type_id).toBe('st-other');

		// Status type itself should be deleted
		const stored = await ctx.store.findOne('status_types', 'test-org', { id: 'st-1' });
		expect(stored).toBeNull();
	});

	it('notifies admins after delete', async () => {
		const ctx = buildContext();
		ctx.store.seed('status_types', [
			{
				id: 'st-1',
				name: 'On Leave',
				color: '#00ff00',
				text_color: '#000000',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		const { remove } = createCrudUseCases(statusTypeCrudConfig);
		await remove(ctx, 'st-1');

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect((notifications[0] as Record<string, unknown>).type).toBe('config_type_deleted');
	});
});
