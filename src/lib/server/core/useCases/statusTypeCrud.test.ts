import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { createCrudUseCases } from './crud';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import type { WriteWithNotificationsPorts } from '$lib/server/core/ports';

const ST_ID = '00000000-0000-4000-a000-000000000001';

// Same status behavior configured by the route, exercised at the use-case boundary.
const useCases = createCrudUseCases<WriteWithNotificationsPorts>({
	entity: StatusTypeEntity,
	auditResource: getEntityAuditResource(StatusTypeEntity),
	policyAction: StatusTypeEntity.policyAction!,
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

	it('edits a status label and color while retaining its other fields', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const historical = {
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Leave',
			color: '#00ff00',
			text_color: '#ffffff',
			sort_order: 3,
			created_at: '2030-01-01T00:00:00Z'
		};
		ctx.store.seed('status_types', [historical]);
		const result = await useCases.update(ctx, { id: ST_ID, name: 'Annual Leave', color: '#22c55e' });
		expect(result).toEqual({
			id: ST_ID,
			organization_id: ctx.auth.orgId,
			name: 'Annual Leave',
			color: '#22c55e',
			textColor: '#ffffff',
			sortOrder: 3,
			created_at: '2030-01-01T00:00:00Z'
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

	it('does not audit or notify success when status deletion fails', async () => {
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
		ctx.store.delete = async () => {
			throw new Error('Status still has a historical reference');
		};
		await expect(useCases.remove(ctx, ST_ID)).rejects.toThrow('historical reference');
		expect(await ctx.store.findOne('status_types', 'test-org', { id: ST_ID })).not.toBeNull();
		expect(ctx.audit.events.some((event) => event.action === 'status_type.deleted')).toBe(false);
		expect(ctx.notifications.notifications).toHaveLength(0);
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
