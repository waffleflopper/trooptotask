import { describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from '$lib/server/adapters/inMemory';
import { createAssignmentType, deleteAssignmentType, updateAssignmentType } from './assignmentTypeOperations.server';

const ID = '00000000-0000-4000-a000-000000000001';

describe('Calendar assignment-type operations', () => {
	it('edits a referenced archived type without changing its identity, exemptions, or saved assignment', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const original = {
			id: ID,
			organization_id: ctx.auth.orgId,
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#dc2626',
			sort_order: 3,
			show_in_date_header: false,
			exempt_personnel_ids: ['person-1'],
			archived_at: '2026-08-01T00:00:00Z'
		};
		ctx.store.seed('assignment_types', [original]);
		ctx.store.seed('daily_assignments', [
			{ id: 'saved', organization_id: ctx.auth.orgId, assignment_type_id: ID, assignee_id: 'person-2' }
		]);

		const result = await updateAssignmentType(ctx, { id: ID, name: 'Staff Duty Night', color: '#123456' });

		expect(result).toMatchObject({
			id: ID,
			name: 'Staff Duty Night',
			shortName: 'SD',
			sortOrder: 3,
			exemptPersonnelIds: ['person-1'],
			archivedAt: '2026-08-01T00:00:00Z'
		});
		expect(await ctx.store.findOne('daily_assignments', ctx.auth.orgId, { id: 'saved' })).toMatchObject({
			assignment_type_id: ID,
			assignee_id: 'person-2'
		});
	});

	it('requires Calendar Organization configuration authority before creating a type', async () => {
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
		await expect(createAssignmentType(ctx, { name: 'Night', shortName: 'N', assignTo: 'group' })).rejects.toMatchObject(
			{
				status: 403
			}
		);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('does not report deletion when the type is still referenced', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		ctx.store.delete = vi.fn().mockRejectedValue(new Error('type still referenced'));
		await expect(deleteAssignmentType(ctx, ID)).rejects.toThrow('type still referenced');
		expect(ctx.audit.events.some((event) => event.action === 'assignment_type.deleted')).toBe(false);
		expect(ctx.notifications.notifications).toEqual([]);
	});
});
