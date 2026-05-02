import { describe, it, expect } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { createCrudUseCases } from './crud';
import { getEntityAuditResource } from '$lib/server/entitySchema';
import type { WriteWithNotificationsPorts } from '$lib/server/core/ports';

const AT_ID = '00000000-0000-4000-a000-000000000001';

// Same config entityHandlers() derives — validates the pattern without HTTP layer
const useCases = createCrudUseCases<WriteWithNotificationsPorts>({
	entity: AssignmentTypeEntity,
	permission: AssignmentTypeEntity.permission!,
	auditResource: getEntityAuditResource(AssignmentTypeEntity),
	requireFullEditor: AssignmentTypeEntity.requireFullEditor,
	afterDelete: async (ctx) => {
		await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: 'An assignment type was deleted.'
		});
	}
});

describe('AssignmentType CRUD use case', () => {
	it('creates an assignment type and audits', async () => {
		const ctx = createWriteWithNotificationsPortsContext();

		const result = (await useCases.create(ctx, {
			name: 'Guard Duty',
			shortName: 'GD',
			assignTo: 'personnel',
			color: '#ff0000',
			sortOrder: 1
		})) as { name: string; shortName: string };

		expect(result).toMatchObject({ name: 'Guard Duty', shortName: 'GD' });
		expect(ctx.audit.events[0].action).toBe('assignment_type.created');
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
				name: 'Guard Duty',
				shortName: 'GD',
				assignTo: 'personnel',
				color: '#ff0000',
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
				policyAction: 'calendar.configureAssignmentTypes',
				reasonCode: 'denied:missing-capability'
			}
		});
	});

	it('notifies admins after delete', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		ctx.store.seed('assignment_types', [
			{
				id: AT_ID,
				name: 'Guard Duty',
				short_name: 'GD',
				assign_to: 'personnel',
				color: '#ff0000',
				sort_order: 0,
				exempt_personnel_ids: [],
				organization_id: 'test-org'
			}
		]);
		await useCases.remove(ctx, AT_ID);

		const notifications = ctx.notifications.notifications;
		expect(notifications).toHaveLength(1);
	});
});
