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

	it.each([
		['missing', { date: '2026-03-22', assignmentTypeId: 'type-a' }],
		['non-string', { date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 123 }]
	])('rejects records with %s assigneeId before persistence and audit side effects', async (_label, record) => {
		const ctx = buildContext();
		ctx.store.findMany = vi.fn(ctx.store.findMany.bind(ctx.store)) as typeof ctx.store.findMany;
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			batchDailyAssignments(ctx, {
				records: [record as Parameters<typeof batchDailyAssignments>[1]['records'][number]]
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Each record must include string date, assignmentTypeId, and assigneeId'
		});

		expect(ctx.store.findMany).not.toHaveBeenCalled();
		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('enforces policy scope on assignee IDs', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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

	it('authorizes group assignees through Calendar group scope', async () => {
		const ctx = buildContext({
			auth: { scopeSet: { kind: 'groups', groupIds: ['group-a'] } }
		});

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
			records: [{ date: '2026-03-22', assignmentTypeId: 'type-group', assigneeId: 'group-a' }]
		});

		expect(result.inserted).toHaveLength(1);
	});

	it('denies group assignees outside Calendar group scope before batch persistence', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			batchDailyAssignments(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-group', assigneeId: 'group-b' }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});

		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
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

	it('treats whitespace assignees as clears before persistence and audit details', async () => {
		const ctx = buildContext();
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
			records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '   ' }]
		});

		expect(result).toEqual({ inserted: [], cleared: 1 });
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
		expect(ctx.audit.events[0]).toMatchObject({
			details: { totalSlots: 1, inserted: 0, cleared: 1 }
		});
	});

	it('rejects duplicate set records before policy, persistence, and audit side effects', async () => {
		const ctx = buildContext();
		ctx.store.findMany = vi.fn(ctx.store.findMany.bind(ctx.store)) as typeof ctx.store.findMany;
		ctx.store.deleteWhereAny = vi.fn(ctx.store.deleteWhereAny.bind(ctx.store)) as typeof ctx.store.deleteWhereAny;
		ctx.store.insertMany = vi.fn(ctx.store.insertMany.bind(ctx.store)) as typeof ctx.store.insertMany;

		await expect(
			batchDailyAssignments(ctx, {
				records: [
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-2' }
				]
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duplicate daily assignment slot in batch: 2026-03-22 / type-a'
		});

		expect(ctx.store.findMany).not.toHaveBeenCalled();
		expect(ctx.store.deleteWhereAny).not.toHaveBeenCalled();
		expect(ctx.store.insertMany).not.toHaveBeenCalled();
		expect(ctx.audit.events).toEqual([]);
	});

	it('rejects duplicate clear records and mixed set clear records with the same invalid-batch rule', async () => {
		for (const records of [
			[
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '' },
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: ' ' }
			],
			[
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
				{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '' }
			]
		]) {
			const ctx = buildContext();

			await expect(batchDailyAssignments(ctx, { records })).rejects.toMatchObject({
				status: 400,
				message: 'Duplicate daily assignment slot in batch: 2026-03-22 / type-a'
			});
			expect(ctx.audit.events).toEqual([]);
		}
	});

	it('preserves Duty Roster Template run lineage on inserted assignments', async () => {
		const ctx = buildContext();

		await batchDailyAssignments(ctx, {
			records: [
				{
					date: '2026-03-22',
					assignmentTypeId: 'type-a',
					assigneeId: 'person-1',
					dutyRosterTemplateRunId: 'run-1',
					dutyRosterTemplateRunRowDate: '2026-03-22'
				}
			]
		});

		const remaining = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(remaining).toEqual([
			expect.objectContaining({
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-03-22'
			})
		]);
	});

	it('replaces affected assignment slots without disturbing unrelated dates', async () => {
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

		const assignments = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', 'test-org');
		expect(assignments).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					date: '2026-04-10',
					assignment_type_id: 'type-a',
					assignee_id: 'person-1'
				}),
				expect.objectContaining({
					date: '2026-04-11',
					assignment_type_id: 'type-a',
					assignee_id: 'person-2'
				})
			])
		);
		expect(assignments).toHaveLength(2);
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
