import { describe, expect, it, vi } from 'vitest';
import { createWriteWithNotificationsPortsContext } from './calendarPersistence.test-support.server';
import {
	createAssignmentType,
	deleteAssignmentType,
	setCalendarLanes,
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
	const type = (id: string, name: string, lane: number | null) => ({
		id,
		organization_id: ctx.auth.orgId,
		name,
		short_name: name[0],
		assign_to: 'personnel',
		color: '#dc2626',
		sort_order: lane ?? 5,
		show_on_calendar: lane !== null,
		roster_pool_rules: null,
		roster_weekend_mode: 'same',
		archived_at: null
	});
	ctx.store.seed('assignment_types', [type(ID, 'Staff', 0), type(OTHER, 'Group', null)]);
	return async () =>
		(
			await ctx.store.findMany<{ name: string; show_on_calendar: boolean; sort_order: number }>(
				'assignment_types',
				ctx.auth.orgId
			)
		)
			.filter((row) => row.show_on_calendar)
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((row) => row.name);
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
			show_on_calendar: false,
			roster_pool_rules: null,
			roster_weekend_mode: 'separate',
			archived_at: '2026-08-01T00:00:00Z'
		};
		ctx.store.seed('assignment_types', [original]);
		ctx.store.seed('roster_excusals', [
			{
				id: 'excusal',
				organization_id: ctx.auth.orgId,
				assignment_type_id: ID,
				personnel_id: 'person-1',
				reason: 'First sergeant',
				starts_on: '2026-07-01',
				ends_on: null
			}
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'saved', organization_id: ctx.auth.orgId, assignment_type_id: ID, assignee_id: 'person-2' }
		]);

		const result = await updateAssignmentType(ctx, { id: ID, name: 'Staff Duty Night', color: '#123456' });

		expect(result).toMatchObject({
			id: ID,
			name: 'Staff Duty Night',
			shortName: 'SD',
			sortOrder: 3,
			weekendMode: 'separate',
			excusals: [{ personId: 'person-1', reason: 'First sergeant', startsOn: '2026-07-01' }],
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

	it('saves the ordered Calendar lanes and audits them', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const lanes = seedTypes(ctx);
		await setCalendarLanes(ctx, { laneTypeIds: [OTHER, ID], expectedLaneTypeIds: [ID] });
		expect(await lanes()).toEqual(['Group', 'Staff']);
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'assignment_type.calendar_lanes_set',
				resourceType: 'organization',
				details: { laneTypeIds: [OTHER, ID] }
			})
		]);
	});

	it('accepts 201 desired and expected lane IDs', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const ids = Array.from({ length: 201 }, (_, index) => `00000000-0000-4000-b000-${String(index).padStart(12, '0')}`);
		ctx.store.seed(
			'assignment_types',
			ids.map((id, index) => ({
				id,
				organization_id: ctx.auth.orgId,
				name: `Duty ${index}`,
				short_name: 'D',
				assign_to: 'personnel',
				color: '#dc2626',
				sort_order: index,
				show_on_calendar: true,
				roster_pool_rules: null,
				roster_weekend_mode: 'same',
				archived_at: null
			}))
		);
		await setCalendarLanes(ctx, { laneTypeIds: [...ids].reverse(), expectedLaneTypeIds: ids });
		const saved = (
			await ctx.store.findMany<{ id: string; show_on_calendar: boolean; sort_order: number }>(
				'assignment_types',
				ctx.auth.orgId
			)
		).filter((row) => row.show_on_calendar);
		expect(saved.sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id)).toEqual([...ids].reverse());
	});

	it.each([
		{},
		{ laneTypeIds: ['not-a-uuid'], expectedLaneTypeIds: [ID] },
		{ laneTypeIds: [OTHER, OTHER], expectedLaneTypeIds: [ID] },
		{ laneTypeIds: [OTHER], expectedLaneTypeIds: [ID], showOnCalendar: true }
	])('rejects a malformed lane change %j before persistence', async (input) => {
		const ctx = createWriteWithNotificationsPortsContext();
		const lanes = seedTypes(ctx);
		const save = vi.spyOn(ctx.calendarCatalogs, 'setCalendarLanes');
		await expect(setCalendarLanes(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(save).not.toHaveBeenCalled();
		expect(await lanes()).toEqual(['Staff']);
	});

	it('denies a Calendar operator the lane change and keeps the lanes', async () => {
		const ctx = createWriteWithNotificationsPortsContext({ auth: { capabilityMap: OPERATOR } });
		const lanes = seedTypes(ctx);
		await expect(setCalendarLanes(ctx, { laneTypeIds: [OTHER], expectedLaneTypeIds: [ID] })).rejects.toMatchObject({
			status: 403
		});
		expect(await lanes()).toEqual(['Staff']);
	});

	it('does not audit a lane change the persistence did not confirm', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		seedTypes(ctx);
		vi.spyOn(ctx.calendarCatalogs, 'setCalendarLanes').mockRejectedValue(new Error('reply lost'));
		await expect(setCalendarLanes(ctx, { laneTypeIds: [OTHER], expectedLaneTypeIds: [ID] })).rejects.toThrow(
			'reply lost'
		);
		expect(ctx.audit.events).toEqual([]);
	});

	it('creates off the calendar and leaves lanes to the lane command', async () => {
		const ctx = createWriteWithNotificationsPortsContext();
		const lanes = seedTypes(ctx);
		const created = await createAssignmentType(ctx, {
			name: 'Night',
			shortName: 'N',
			assignTo: 'group',
			showOnCalendar: false,
			sortOrder: 9
		});
		expect(created).toMatchObject({ name: 'Night', showOnCalendar: false, sortOrder: 0 });
		await expect(
			createAssignmentType(ctx, { name: 'Day', shortName: 'D', assignTo: 'group', showOnCalendar: true })
		).rejects.toMatchObject({ status: 400 });
		await expect(updateAssignmentType(ctx, { id: OTHER, showOnCalendar: true })).rejects.toMatchObject({
			status: 400
		});
		await expect(updateAssignmentType(ctx, { id: ID, showOnCalendar: false })).rejects.toMatchObject({
			status: 400
		});
		await updateAssignmentType(ctx, { id: ID, sortOrder: 4 });
		expect(await lanes()).toEqual(['Staff']);
		expect(await ctx.store.findOne('assignment_types', ctx.auth.orgId, { id: ID })).toMatchObject({ sort_order: 0 });
	});
});
