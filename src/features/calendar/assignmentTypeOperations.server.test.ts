import { describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import {
	createAssignmentType,
	deleteAssignmentType,
	setAssignmentTypeDateHeader,
	updateAssignmentType
} from './assignmentTypeOperations.server';

const ID = '00000000-0000-4000-a000-000000000001';
const OTHER = '00000000-0000-4000-a000-000000000002';
const OPERATOR = {
	calendar: 'operate',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
} as const;

function seedTypes(ctx: ReturnType<typeof createWriteWithNotificationsPortsContext>) {
	const type = (id: string, name: string, header: boolean, archivedAt: string | null = null) => ({
		id,
		organization_id: ctx.auth.orgId,
		name,
		short_name: name[0],
		assign_to: 'personnel',
		color: '#dc2626',
		sort_order: 0,
		show_in_date_header: header,
		exempt_personnel_ids: [],
		archived_at: archivedAt
	});
	ctx.store.seed('assignment_types', [type(ID, 'Staff', true), type(OTHER, 'Group', false)]);
	return async () =>
		Object.fromEntries(
			(
				await ctx.store.findMany<{ name: string; show_in_date_header: boolean }>('assignment_types', ctx.auth.orgId)
			).map((row) => [row.name, row.show_in_date_header])
		);
}

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
		seedTypes(ctx);
		ctx.store.delete = vi.fn().mockRejectedValue(new Error('type still referenced'));
		await expect(deleteAssignmentType(ctx, ID)).rejects.toThrow('type still referenced');
		expect(ctx.audit.events.some((event) => event.action === 'assignment_type.deleted')).toBe(false);
		expect(ctx.notifications.notifications).toEqual([]);
	});

	it('makes the chosen type the only date header and audits the choice', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const headers = seedTypes(ctx);
		await setAssignmentTypeDateHeader(ctx, { assignmentTypeId: OTHER });
		expect(await headers()).toEqual({ Staff: false, Group: true });
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({ action: 'assignment_type.date_header_set', resourceId: OTHER })
		]);
	});

	it.each([{}, { assignmentTypeId: 'not-a-uuid' }, { assignmentTypeId: OTHER, showInDateHeader: true }])(
		'rejects a malformed date-header choice %j before persistence',
		async (input) => {
			const ctx = createWriteWithNotificationsPortsContext();
			const headers = seedTypes(ctx);
			const setDateHeader = vi.spyOn(ctx.calendarCatalogs, 'setDateHeader');
			await expect(setAssignmentTypeDateHeader(ctx, input)).rejects.toMatchObject({
				status: 400,
				body: { message: 'Choose an assignment type' }
			});
			expect(setDateHeader).not.toHaveBeenCalled();
			expect(await headers()).toEqual({ Staff: true, Group: false });
		}
	);

	it('denies a Calendar operator the date-header choice and keeps the header', async () => {
		const ctx = createWriteWithNotificationsPortsContext({ auth: { capabilityMap: OPERATOR } });
		const headers = seedTypes(ctx);
		await expect(setAssignmentTypeDateHeader(ctx, { assignmentTypeId: OTHER })).rejects.toMatchObject({ status: 403 });
		expect(await headers()).toEqual({ Staff: true, Group: false });
	});

	it('does not audit a date-header choice the persistence did not confirm', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedTypes(ctx);
		vi.spyOn(ctx.calendarCatalogs, 'setDateHeader').mockRejectedValue(new Error('reply lost'));
		await expect(setAssignmentTypeDateHeader(ctx, { assignmentTypeId: OTHER })).rejects.toThrow('reply lost');
		expect(ctx.audit.events).toEqual([]);
	});

	it('creates with the stored false flag and rejects a header flag on generic create or update', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const headers = seedTypes(ctx);
		const created = await createAssignmentType(ctx, {
			name: 'Night',
			shortName: 'N',
			assignTo: 'group',
			showInDateHeader: false
		});
		expect(created).toMatchObject({ name: 'Night', showInDateHeader: false });
		await expect(
			createAssignmentType(ctx, { name: 'Day', shortName: 'D', assignTo: 'group', showInDateHeader: true })
		).rejects.toMatchObject({ status: 400 });
		await expect(updateAssignmentType(ctx, { id: OTHER, showInDateHeader: true })).rejects.toMatchObject({
			status: 400
		});
		await expect(updateAssignmentType(ctx, { id: ID, showInDateHeader: false })).rejects.toMatchObject({
			status: 400
		});
		expect(await headers()).toEqual({ Staff: true, Group: false, Night: false });
	});
});
