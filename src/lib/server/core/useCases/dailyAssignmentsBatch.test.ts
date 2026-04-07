import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { batchDailyAssignments } from './dailyAssignmentsBatch';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('batchDailyAssignments', () => {
	it('rejects empty records array', async () => {
		const ctx = buildContext();
		await expect(batchDailyAssignments(ctx, { records: [] })).rejects.toMatchObject({
			status: 400,
			message: 'records array is required'
		});
	});

	it('rejects batches over 1000 records', async () => {
		const ctx = buildContext();
		const records = Array.from({ length: 1001 }, (_, i) => ({
			date: '2026-03-22',
			assignmentTypeId: `type-${i}`,
			assigneeId: `person-${i}`
		}));
		await expect(batchDailyAssignments(ctx, { records })).rejects.toMatchObject({
			status: 400,
			message: 'Maximum 1000 records per batch'
		});
	});

	it('blocks when read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('enforces group scope on assignee IDs', async () => {
		const ctx = buildContext({
			auth: {
				async requireGroupAccessBatch() {
					throw Object.assign(new Error('Group access denied'), { status: 403 });
				}
			}
		});
		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('allows group assignees without running personnel group checks', async () => {
		const requireGroupAccessBatch = vi.fn(async () => {
			throw Object.assign(new Error('should not be called'), { status: 403 });
		});
		const ctx = buildContext({ auth: { scopedGroupId: 'group-a', requireGroupAccessBatch } });

		ctx.store.seed('assignment_types', [
			{
				id: 'type-group',
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

		const result = await batchDailyAssignments(ctx, {
			records: [{ date: '2026-03-22', assignmentTypeId: 'type-group', assigneeId: 'Front Desk' }]
		});

		expect(result.inserted).toHaveLength(1);
		expect(requireGroupAccessBatch).not.toHaveBeenCalled();
	});

	it('logs an audit event', async () => {
		const ctx = buildContext();
		await batchDailyAssignments(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-03-22', assignmentTypeId: 'type-b', assigneeId: '' }
			]
		});
		expect(ctx.audit.events).toHaveLength(1);
		expect(ctx.audit.events[0]).toMatchObject({
			action: 'daily_assignment.batch_replaced',
			resourceType: 'daily_assignment',
			details: { totalSlots: 2, inserted: 1, cleared: 1 }
		});
	});

	it('clears affected slots and inserts upserts', async () => {
		const ctx = buildContext();

		// Seed an existing assignment that should be cleared
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person'
			}
		]);

		const result = await batchDailyAssignments(ctx, {
			records: [
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-03-22', assignmentTypeId: 'type-b', assigneeId: '' } // clear slot
			]
		});

		expect(result.inserted).toHaveLength(1);
		expect(result.cleared).toBe(1);

		// Verify old assignment was cleared
		const remaining = await ctx.store.findMany('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect((remaining[0] as Record<string, unknown>).assignee_id).toBe('person-1');
	});

	it('rejects the batch when a record overlaps duty coverage and leaves existing assignments untouched', async () => {
		const ctx = buildContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-1',
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
			{
				id: 'existing-1',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person'
			}
		]);

		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2026-03-22',
				coverage_start: '2026-03-22T06:00:00',
				coverage_end: '2026-03-22T18:00:00',
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
				assignee_id: 'person-1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is already assigned to duty coverage from 2026-03-22T06:00:00 to 2026-03-22T18:00:00.'
		});

		const remaining = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect(remaining[0]).toMatchObject({
			id: 'existing-1',
			assignee_id: 'old-person'
		});
	});
});
