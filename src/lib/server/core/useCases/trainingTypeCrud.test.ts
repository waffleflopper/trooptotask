import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { createCrudUseCases } from './crud';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

const TT_ID = '00000000-0000-4000-a000-000000000001';
const PT_1 = '00000000-0000-4000-a000-000000000011';
const PT_2 = '00000000-0000-4000-a000-000000000012';
const PT_3 = '00000000-0000-4000-a000-000000000013';

// Same config entityHandlers() derives — validates the pattern without HTTP layer
const useCases = createCrudUseCases({
	entity: TrainingTypeEntity,
	permission: TrainingTypeEntity.permission!,
	auditResource: (TrainingTypeEntity.audit as { resourceType: string }).resourceType,
	requireFullEditor: TrainingTypeEntity.requireFullEditor,
	beforeDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('personnel_trainings', ctx.auth.orgId, {
			training_type_id: id
		});
	},
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Training Type Deleted',
			message: 'A training type was deleted.'
		});
	}
});

describe('TrainingType CRUD use case', () => {
	it('creates a training type and audits', async () => {
		const ctx = createWritePortsContext();

		const result = (await useCases.create(ctx, {
			name: 'First Aid',
			description: 'Basic first aid training',
			expirationMonths: 12,
			sortOrder: 1
		})) as { name: string };

		expect(result).toMatchObject({ name: 'First Aid' });
		expect(ctx.audit.events[0].action).toBe('training_type.created');
	});

	it('cascade-deletes personnel_trainings before deleting training type', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('training_types', [
			{
				id: TT_ID,
				name: 'First Aid',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#6b7280',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('personnel_trainings', [
			{ id: PT_1, training_type_id: TT_ID, organization_id: 'test-org' },
			{ id: PT_2, training_type_id: TT_ID, organization_id: 'test-org' },
			{ id: PT_3, training_type_id: 'tt-other', organization_id: 'test-org' }
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		await useCases.remove(ctx, TT_ID);

		const remaining = await ctx.store.findMany('personnel_trainings', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).training_type_id).toBe('tt-other');

		const stored = await ctx.store.findOne('training_types', 'test-org', { id: TT_ID });
		expect(stored).toBeNull();
	});

	it('notifies admins after delete', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('training_types', [
			{
				id: TT_ID,
				name: 'First Aid',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
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

		await useCases.remove(ctx, TT_ID);

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect((notifications[0] as Record<string, unknown>).type).toBe('config_type_deleted');
	});
});
