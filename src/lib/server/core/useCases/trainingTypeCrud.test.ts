import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createCrudUseCases } from './crud';
import { trainingTypeCrudConfig } from './trainingTypeCrud';

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

describe('TrainingType CRUD use case', () => {
	it('creates a training type and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(trainingTypeCrudConfig);

		const result = (await create(ctx, {
			name: 'First Aid',
			description: 'Basic first aid training',
			expirationMonths: 12,
			sortOrder: 1
		})) as { name: string };

		expect(result).toMatchObject({ name: 'First Aid' });
		expect(ctx.auditPort.events[0].action).toBe('training_type.created');
	});

	it('cascade-deletes personnel_trainings before deleting training type', async () => {
		const ctx = buildContext();
		ctx.store.seed('training_types', [
			{
				id: 'tt-1',
				name: 'First Aid',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				required_for_roles: [],
				color: '#6b7280',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('personnel_trainings', [
			{ id: 'pt-1', training_type_id: 'tt-1', organization_id: 'test-org' },
			{ id: 'pt-2', training_type_id: 'tt-1', organization_id: 'test-org' },
			{ id: 'pt-3', training_type_id: 'tt-other', organization_id: 'test-org' }
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		const { remove } = createCrudUseCases(trainingTypeCrudConfig);
		await remove(ctx, 'tt-1');

		const remaining = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).training_type_id).toBe('tt-other');

		const stored = await ctx.store.findOne('training_types', 'test-org', { id: 'tt-1' });
		expect(stored).toBeNull();
	});

	it('notifies admins after delete', async () => {
		const ctx = buildContext();
		ctx.store.seed('training_types', [
			{
				id: 'tt-1',
				name: 'First Aid',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				required_for_roles: [],
				color: '#6b7280',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		const { remove } = createCrudUseCases(trainingTypeCrudConfig);
		await remove(ctx, 'tt-1');

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect((notifications[0] as Record<string, unknown>).type).toBe('config_type_deleted');
	});
});
