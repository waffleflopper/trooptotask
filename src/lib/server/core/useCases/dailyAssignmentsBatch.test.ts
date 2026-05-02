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

	it('enforces policy scope on assignee IDs', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopedGroupId: null,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', group_id: 'group-c' }]);

		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
	});

	it('denies clearing an affected slot when the existing assignee is outside policy scope', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopedGroupId: null,
				scopeSet: { kind: 'groups', groupIds: ['group-a'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [{ id: 'person-outside', organization_id: 'test-org', group_id: 'group-c' }]);
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-outside',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-outside'
			}
		]);

		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '' }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		const rawStore = ctx.rawStore;
		expect(rawStore).toBeDefined();
		if (!rawStore) throw new Error('Expected rawStore in scoped batch assignment test');
		const remaining = await rawStore.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.id).toBe('existing-outside');
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

	it('checks duty coverage in bulk and clears affected assignment slots with one predicate delete', async () => {
		const ctx = buildContext();
		const findManyCalls: string[] = [];
		const originalFindMany = ctx.store.findMany.bind(ctx.store);
		ctx.store.findMany = (async (...args) => {
			findManyCalls.push(String(args[0]));
			return originalFindMany(...args);
		}) as typeof ctx.store.findMany;
		ctx.store.deleteWhere = vi.fn(ctx.store.deleteWhere.bind(ctx.store)) as typeof ctx.store.deleteWhere;
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.deleteManyByIds = vi.fn(ctx.store.deleteManyByIds.bind(ctx.store)) as typeof ctx.store.deleteManyByIds;

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
			},
			{
				id: 'person-2',
				organization_id: 'test-org',
				rank: 'SSG',
				last_name: 'Parker',
				first_name: 'Drew',
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
				date: '2026-04-10',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person-1'
			},
			{
				id: 'existing-2',
				organization_id: 'test-org',
				date: '2026-04-11',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person-2'
			}
		]);
		ctx.store.seed('duty_events', [
			{
				id: 'duty-event-1',
				organization_id: 'test-org',
				template_id: 'tmpl-1',
				template_name: 'Battalion Staff Duty',
				event_date: '2026-04-08',
				coverage_start: '2026-04-08T06:00:00',
				coverage_end: '2026-04-08T18:00:00',
				coverage_mode: 'timed',
				start_time: '06:00',
				end_time: '18:00',
				is_blocking: true,
				cooldown_hours: 0,
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

		await batchDailyAssignments(ctx, {
			records: [
				{ date: '2026-04-10', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-04-11', assignmentTypeId: 'type-a', assigneeId: 'person-2' }
			]
		});

		expect(findManyCalls.filter((table) => table === 'duty_events')).toHaveLength(1);
		expect(findManyCalls.filter((table) => table === 'duty_event_slots')).toHaveLength(1);
		expect(ctx.store.deleteWhere).not.toHaveBeenCalled();
		expect(ctx.store.deleteManyByIds).not.toHaveBeenCalled();
		expect(ctx.store.deleteWhereAny).toHaveBeenCalledWith('daily_assignments', 'test-org', [
			{ date: '2026-04-10', assignment_type_id: 'type-a' },
			{ date: '2026-04-11', assignment_type_id: 'type-a' }
		]);
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
