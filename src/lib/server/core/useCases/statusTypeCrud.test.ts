import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { createCrudUseCases } from './crud';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import type { WriteWithNotificationsPorts } from '$lib/server/core/ports';

const ST_ID = '00000000-0000-4000-a000-000000000001';

// Same config entityHandlers() derives — validates the pattern without HTTP layer
const useCases = createCrudUseCases<WriteWithNotificationsPorts>({
	entity: StatusTypeEntity,
	auditResource: getEntityAuditResource(StatusTypeEntity),
	policyAction: StatusTypeEntity.policyAction!,
	beforeDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('availability_entries', ctx.auth.orgId, {
			status_type_id: id
		});
	},
	afterDelete: async (ctx) => {
		await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: 'A status type was deleted.'
		});
	}
});

describe('StatusType CRUD use case', () => {
	it('creates a status type and audits', async () => {
		const ctx = createWriteWithNotificationsPortsContext();

		const result = (await useCases.create(ctx, {
			name: 'On Leave',
			color: '#00ff00',
			textColor: '#000000',
			sortOrder: 1
		})) as { name: string };

		expect(result).toMatchObject({ name: 'On Leave' });
		expect(ctx.audit.events[0].action).toBe('status_type.created');
	});

	it('edits ordinary fields without exposing or overwriting stored retired metadata', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const historical = {
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Leave',
			color: '#00ff00',
			text_color: '#ffffff',
			sort_order: 3,
			da6_availability_treatment: 'authorized-absence',
			da6_treatment_reviewed: true
		};
		ctx.store.seed('status_types', [historical]);
		const result = await useCases.update(ctx, { id: ST_ID, name: 'Annual Leave', color: '#22c55e' });
		expect(result).toEqual({
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Annual Leave',
			color: '#22c55e',
			textColor: '#ffffff',
			sortOrder: 3
		});
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: ST_ID })).toEqual({
			...historical,
			name: 'Annual Leave',
			color: '#22c55e'
		});
		expect(ctx.audit.events[0]).toMatchObject({ action: 'status_type.updated', resourceId: ST_ID });
	});

	it('requires Calendar configure capability through the CRUD interface', async () => {
		const ctx = createWriteWithNotificationsPortsContext({
			auth: {
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(
			useCases.create(ctx, {
				name: 'On Leave',
				color: '#00ff00',
				textColor: '#000000',
				sortOrder: 1
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'This action requires Calendar configuration access'
		});
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.configureStatusTypes',
				reasonCode: 'denied:missing-capability'
			}
		});
	});

	it('allows Calendar configure capability without relying on full-editor legacy checks', async () => {
		const ctx = createWriteWithNotificationsPortsContext();

		const result = (await useCases.create(ctx, {
			name: 'TDY',
			color: '#00ff00',
			textColor: '#000000',
			sortOrder: 2
		})) as { name: string };

		expect(result.name).toBe('TDY');
	});

	it('cascade-deletes availability_entries before deleting status type', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
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
		const ctx = createWriteWithNotificationsPortsContext();
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
		await useCases.remove(ctx, ST_ID);

		const notifications = ctx.notifications.notifications;
		expect(notifications).toHaveLength(1);
		expect(notifications[0].notification.type).toBe('config_type_deleted');
	});
});
