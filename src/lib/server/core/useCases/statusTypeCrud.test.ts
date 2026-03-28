import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { createCrudUseCases } from './crud';
import { notifyAdminsViaStore } from './notifyAdminsHelper';

const ST_ID = '00000000-0000-4000-a000-000000000001';

// Same config entityHandlers() derives — validates the pattern without HTTP layer
const useCases = createCrudUseCases({
	entity: StatusTypeEntity,
	permission: StatusTypeEntity.permission!,
	auditResource: (StatusTypeEntity.audit as { resourceType: string }).resourceType,
	requireFullEditor: StatusTypeEntity.requireFullEditor,
	beforeDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('availability_entries', ctx.auth.orgId, {
			status_type_id: id
		});
	},
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: 'A status type was deleted.'
		});
	}
});

describe('StatusType CRUD use case', () => {
	it('creates a status type and audits', async () => {
		const ctx = createWritePortsContext();

		const result = (await useCases.create(ctx, {
			name: 'On Leave',
			color: '#00ff00',
			textColor: '#000000',
			sortOrder: 1
		})) as { name: string };

		expect(result).toMatchObject({ name: 'On Leave' });
		expect(ctx.audit.events[0].action).toBe('status_type.created');
	});

	it('cascade-deletes availability_entries before deleting status type', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('status_types', [
			{
				id: ST_ID,
				name: 'On Leave',
				color: '#00ff00',
				text_color: '#000000',
				sort_order: 0,
				organization_id: 'test-org'
			}
		]);
		ctx.store.seed('availability_entries', [
			{ id: 'ae-1', status_type_id: ST_ID, organization_id: 'test-org' },
			{ id: 'ae-2', status_type_id: ST_ID, organization_id: 'test-org' },
			{ id: 'ae-3', status_type_id: 'st-other', organization_id: 'test-org' }
		]);
		ctx.store.seed('organization_memberships', [
			{ user_id: 'other-admin', organization_id: 'test-org', role: 'admin' }
		]);

		await useCases.remove(ctx, ST_ID);

		// Related availability entries for ST_ID should be deleted
		const remaining = await ctx.store.findMany('availability_entries', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).status_type_id).toBe('st-other');

		// Status type itself should be deleted
		const stored = await ctx.store.findOne('status_types', 'test-org', { id: ST_ID });
		expect(stored).toBeNull();
	});

	it('notifies admins after delete', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed('status_types', [
			{
				id: ST_ID,
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

		await useCases.remove(ctx, ST_ID);

		const notifications = await ctx.store.findMany('notifications', 'test-org');
		expect(notifications).toHaveLength(1);
		expect((notifications[0] as Record<string, unknown>).type).toBe('config_type_deleted');
	});
});
