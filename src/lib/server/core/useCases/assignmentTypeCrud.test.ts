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
import { assignmentTypeCrudConfig } from './assignmentTypeCrud';

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

describe('AssignmentType CRUD use case', () => {
	it('creates an assignment type and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(assignmentTypeCrudConfig);

		const result = (await create(ctx, {
			name: 'Guard Duty',
			shortName: 'GD',
			assignTo: 'personnel',
			color: '#ff0000',
			sortOrder: 1
		})) as { name: string; shortName: string };

		expect(result).toMatchObject({ name: 'Guard Duty', shortName: 'GD' });
		expect(ctx.auditPort.events[0].action).toBe('assignment_type.created');
	});

	it('requires full editor permission', async () => {
		const ctx = buildContext({
			auth: {
				requireFullEditor() {
					throw new Error('Requires full editor');
				}
			}
		});
		const { create } = createCrudUseCases(assignmentTypeCrudConfig);

		await expect(create(ctx, { name: 'X', shortName: 'X', assignTo: 'personnel' })).rejects.toThrow(
			'Requires full editor'
		);
	});

	it('notifies admins after delete', async () => {
		const ctx = buildContext();
		ctx.store.seed('assignment_types', [
			{
				id: 'at-1',
				name: 'Guard Duty',
				short_name: 'GD',
				assign_to: 'personnel',
				color: '#ff0000',
				sort_order: 0,
				exempt_personnel_ids: [],
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		const { remove } = createCrudUseCases(assignmentTypeCrudConfig);
		await remove(ctx, 'at-1');

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
	});
});
