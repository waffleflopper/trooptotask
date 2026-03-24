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
import { createCrudUseCases } from './crud';
import { GroupEntity } from '$lib/server/entities/group';

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
		notifications: createTestNotificationPort()
	};
}

const groupCrudConfig = {
	entity: GroupEntity,
	permission: 'personnel' as const,
	auditResource: 'group'
};

describe('Group CRUD use case', () => {
	it('creates a group, persists it, and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(groupCrudConfig);

		const result = (await create(ctx, { name: 'Alpha Team', sortOrder: 1 })) as {
			name: string;
			sortOrder: number;
		};

		expect(result).toMatchObject({ name: 'Alpha Team', sortOrder: 1 });

		const stored = await ctx.store.findMany('groups', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'group.created',
			resourceType: 'group'
		});
	});

	it('updates a group name and audits', async () => {
		const ctx = buildContext();
		const { update } = createCrudUseCases(groupCrudConfig);

		ctx.store.seed('groups', [{ id: 'g-1', name: 'Old Name', sort_order: 0, organization_id: 'test-org' }]);

		const result = (await update(ctx, { id: 'g-1', name: 'New Name' })) as { name: string };
		expect(result.name).toBe('New Name');

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'group.updated',
			resourceId: 'g-1'
		});
	});

	it('deletes a group and audits', async () => {
		const ctx = buildContext();
		const { remove } = createCrudUseCases(groupCrudConfig);

		ctx.store.seed('groups', [{ id: 'g-1', name: 'Doomed', sort_order: 0, organization_id: 'test-org' }]);

		await remove(ctx, 'g-1');

		const stored = await ctx.store.findOne('groups', 'test-org', { id: 'g-1' });
		expect(stored).toBeNull();

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'group.deleted',
			resourceId: 'g-1'
		});
	});

	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createCrudUseCases(groupCrudConfig);

		await expect(create(ctx, { name: 'Nope' })).rejects.toMatchObject({ status: 403 });
	});
});
