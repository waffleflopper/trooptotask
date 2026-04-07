import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	clearDailyAssignment,
	createDailyAssignment,
	deleteDailyAssignment,
	replaceDailyAssignments,
	setDailyAssignment,
	updateDailyAssignment
} from './dailyAssignments';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('replaceDailyAssignments', () => {
	it('deletes existing assignments for the date and inserts new batch', async () => {
		const ctx = buildContext();

		// Seed existing assignments for the target date
		ctx.store.seed('daily_assignments', [
			{ id: 'old-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-1' },
			{ id: 'old-2', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-2', assignee_id: 'p-2' },
			// Different date — should NOT be deleted
			{ id: 'keep-1', organization_id: 'test-org', date: '2025-04-02', assignment_type_id: 'at-1', assignee_id: 'p-3' }
		]);

		const result = await replaceDailyAssignments(ctx, {
			date: '2025-04-01',
			records: [
				{ assignmentTypeId: 'at-1', assigneeId: 'p-10' },
				{ assignmentTypeId: 'at-3', assigneeId: 'p-11' }
			]
		});

		// New records returned
		expect(result).toHaveLength(2);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-10' }),
				expect.objectContaining({ date: '2025-04-01', assignmentTypeId: 'at-3', assigneeId: 'p-11' })
			])
		);

		// Old records for that date are gone, replaced by new ones
		const remaining = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(3); // 2 new + 1 kept from other date

		// The old IDs should not exist
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain('old-1');
		expect(ids).not.toContain('old-2');

		// The other date's record persists
		expect(ids).toContain('keep-1');

		// Audit logged
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.replaced',
			resourceType: 'daily_assignment'
		});
	});

	it('enforces group scope on all assignee IDs in the batch', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch() {
					throw groupAccessError;
				}
			}
		});

		await expect(
			replaceDailyAssignments(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: 'at-1', assigneeId: 'p-outside-group' }]
			})
		).rejects.toMatchObject({ status: 403 });

		// Nothing should have been inserted
		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('rejects replacing a day when an existing assignment is outside the scoped group', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch(personnelIds: string[]) {
					if (personnelIds.includes('p-outside-group')) {
						throw groupAccessError;
					}
				}
			}
		});

		ctx.store.seed('daily_assignments', [
			{
				id: 'old-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: 'at-1',
				assignee_id: 'p-outside-group'
			}
		]);

		await expect(
			replaceDailyAssignments(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: 'at-2', assigneeId: 'p-in-group' }]
			})
		).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]?.id).toBe('old-1');
	});

	it('rejects replacing a day when a new assignee already has overlapping duty coverage', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'old-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-old' }
		]);
		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2025-04-01',
				coverage_start: '2025-04-01T06:00:00',
				coverage_end: '2025-04-01T18:00:00',
				coverage_mode: 'timed',
				start_time: '06:00',
				end_time: '18:00',
				is_blocking: true,
				cooldown_hours: 12,
				fill_summary: {},
				collision_summary: {},
				rules_snapshot: {}
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'duty-slot-1',
				organization_id: 'test-org',
				duty_event_id: 'duty-event-1',
				template_slot_id: 'slot-nco',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'p-1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		await expect(
			replaceDailyAssignments(ctx, {
				date: '2025-04-01',
				records: [{ assignmentTypeId: 'at-1', assigneeId: 'p-1' }]
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is already assigned to duty coverage from 2025-04-01T06:00:00 to 2025-04-01T18:00:00.'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			id: 'old-1',
			assignee_id: 'p-old'
		});
	});
});

describe('createDailyAssignment', () => {
	const validInput = {
		date: '2025-04-01',
		assignmentTypeId: 'at-1',
		assigneeId: 'p-1'
	};

	it('validates, inserts, audits, and returns transformed result', async () => {
		const ctx = buildContext();

		const result = (await createDailyAssignment(ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			date: '2025-04-01',
			assignmentTypeId: 'at-1',
			assigneeId: 'p-1'
		});

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.created',
			resourceType: 'daily_assignment'
		});
	});

	it('enforces group scope on assigneeId', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccess() {
					throw groupAccessError;
				}
			}
		});

		await expect(createDailyAssignment(ctx, validInput)).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('allows group assignees without running personnel group checks', async () => {
		const requireGroupAccess = vi.fn(async () => {
			throw Object.assign(new Error('should not be called'), { status: 403 });
		});
		const ctx = buildContext({ auth: { scopedGroupId: 'group-a', requireGroupAccess } });

		ctx.store.seed('assignment_types', [
			{
				id: 'at-group',
				organization_id: 'test-org',
				name: 'Front Desk',
				short_name: 'FD',
				assign_to: 'group',
				color: '#123456',
				sort_order: 0,
				exempt_personnel_ids: [],
				show_in_date_header: false
			}
		]);

		const result = (await createDailyAssignment(ctx, {
			date: '2025-04-01',
			assignmentTypeId: 'at-group',
			assigneeId: 'Front Desk'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ assigneeId: 'Front Desk', assignmentTypeId: 'at-group' });
		expect(requireGroupAccess).not.toHaveBeenCalled();
	});
});

describe('setDailyAssignment', () => {
	it('rejects a manual assignment when the assignee already has overlapping duty coverage and preserves the existing slot', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'p-old',
				organization_id: 'test-org',
				rank: 'SSG',
				last_name: 'Baker',
				first_name: 'Jordan',
				mos: '11B',
				clinic_role: 'Platoon Sergeant',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-slot',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: 'at-1',
				assignee_id: 'p-old'
			}
		]);

		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2025-04-01',
				coverage_start: '2025-04-01T06:00:00',
				coverage_end: '2025-04-01T18:00:00',
				coverage_mode: 'timed',
				start_time: '06:00',
				end_time: '18:00',
				is_blocking: true,
				cooldown_hours: 12,
				fill_summary: {},
				collision_summary: {},
				rules_snapshot: {}
			}
		]);

		ctx.store.seed('duty_event_slots', [
			{
				id: 'duty-slot-1',
				organization_id: 'test-org',
				duty_event_id: 'duty-event-1',
				template_slot_id: 'slot-nco',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'p-1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		await expect(
			setDailyAssignment(ctx, {
				date: '2025-04-01',
				assignmentTypeId: 'at-1',
				assigneeId: 'p-1'
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is already assigned to duty coverage from 2025-04-01T06:00:00 to 2025-04-01T18:00:00.'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			id: 'existing-slot',
			assignee_id: 'p-old'
		});
	});

	it('rejects a manual assignment when the assignee is still in duty cooldown', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2025-03-31',
				coverage_start: '2025-03-31T08:00:00',
				coverage_end: '2025-03-31T20:00:00',
				coverage_mode: 'timed',
				start_time: '08:00',
				end_time: '20:00',
				is_blocking: true,
				cooldown_hours: 24,
				fill_summary: {},
				collision_summary: {},
				rules_snapshot: {}
			}
		]);

		ctx.store.seed('duty_event_slots', [
			{
				id: 'duty-slot-1',
				organization_id: 'test-org',
				duty_event_id: 'duty-event-1',
				template_slot_id: 'slot-nco',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'p-1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		await expect(
			setDailyAssignment(ctx, {
				date: '2025-04-01',
				assignmentTypeId: 'at-1',
				assigneeId: 'p-1'
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is still in cooldown until 2025-04-01T20:00:00.'
		});
	});

	it('allows assigning a group without running personnel availability checks', async () => {
		const requireGroupAccess = vi.fn(async () => {
			throw Object.assign(new Error('should not be called'), { status: 403 });
		});
		const ctx = buildContext({ auth: { scopedGroupId: 'group-a', requireGroupAccess } });

		ctx.store.seed('assignment_types', [
			{
				id: 'at-group',
				organization_id: 'test-org',
				name: 'Front Desk',
				short_name: 'FD',
				assign_to: 'group',
				color: '#123456',
				sort_order: 0,
				exempt_personnel_ids: [],
				show_in_date_header: false
			}
		]);

		const result = (await setDailyAssignment(ctx, {
			date: '2025-04-01',
			assignmentTypeId: 'at-group',
			assigneeId: 'Front Desk'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ assigneeId: 'Front Desk', assignmentTypeId: 'at-group' });
		expect(requireGroupAccess).not.toHaveBeenCalled();
	});
});

describe('updateDailyAssignment', () => {
	it('rejects updating an assignment when the new assignee already has overlapping duty coverage', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'da-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-old' }
		]);
		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2025-04-01',
				coverage_start: '2025-04-01T06:00:00',
				coverage_end: '2025-04-01T18:00:00',
				coverage_mode: 'timed',
				start_time: '06:00',
				end_time: '18:00',
				is_blocking: true,
				cooldown_hours: 12,
				fill_summary: {},
				collision_summary: {},
				rules_snapshot: {}
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'duty-slot-1',
				organization_id: 'test-org',
				duty_event_id: 'duty-event-1',
				template_slot_id: 'slot-nco',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'p-1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		await expect(
			updateDailyAssignment(ctx, {
				id: 'da-1',
				assigneeId: 'p-1'
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is already assigned to duty coverage from 2025-04-01T06:00:00 to 2025-04-01T18:00:00.'
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			id: 'da-1',
			assignee_id: 'p-old'
		});
	});
});

describe('deleteDailyAssignment', () => {
	function seedAssignment(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('daily_assignments', [
			{ id: 'da-1', organization_id: 'test-org', date: '2025-04-01', assignment_type_id: 'at-1', assignee_id: 'p-1' }
		]);
	}

	it('deletes record and audits', async () => {
		const ctx = buildContext();
		seedAssignment(ctx);

		await deleteDailyAssignment(ctx, 'da-1');

		const stored = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(stored).toHaveLength(0);

		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.deleted',
			resourceType: 'daily_assignment',
			resourceId: 'da-1'
		});
	});
});

describe('clearDailyAssignment', () => {
	it('rejects clearing an assignment slot when the existing assignee is outside the scoped group', async () => {
		const groupAccessError = new Error('Group access denied');
		(groupAccessError as unknown as Record<string, unknown>).status = 403;
		const ctx = buildContext({
			auth: {
				scopedGroupId: 'group-a',
				async requireGroupAccessBatch(personnelIds: string[]) {
					if (personnelIds.includes('p-outside-group')) {
						throw groupAccessError;
					}
				}
			}
		});

		ctx.store.seed('daily_assignments', [
			{
				id: 'da-1',
				organization_id: 'test-org',
				date: '2025-04-01',
				assignment_type_id: 'at-1',
				assignee_id: 'p-outside-group'
			}
		]);

		await expect(clearDailyAssignment(ctx, { date: '2025-04-01', assignmentTypeId: 'at-1' })).rejects.toMatchObject({
			status: 403
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(stored).toHaveLength(1);
		expect(stored[0]?.id).toBe('da-1');
	});
});

describe('read-only and permission guards', () => {
	it('rejects create when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(
			createDailyAssignment(ctx, { date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-1' })
		).rejects.toMatchObject({ status: 403 });
	});

	it('rejects replace when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(replaceDailyAssignments(ctx, { date: '2025-04-01', records: [] })).rejects.toMatchObject({
			status: 403
		});
	});

	it('rejects delete when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(deleteDailyAssignment(ctx, 'da-1')).rejects.toMatchObject({ status: 403 });
	});

	it('rejects when user lacks calendar edit permission', async () => {
		const ctx = buildContext({
			auth: {
				requireEdit() {
					throw new Error('No edit permission');
				}
			}
		});
		await expect(
			createDailyAssignment(ctx, { date: '2025-04-01', assignmentTypeId: 'at-1', assigneeId: 'p-1' })
		).rejects.toThrow('No edit permission');
	});
});
