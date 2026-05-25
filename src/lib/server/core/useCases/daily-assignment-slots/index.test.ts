import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	clearDailyAssignmentSlot,
	replaceDailyAssignmentDay,
	replaceDailyAssignmentSlotsBatch,
	setDailyAssignmentSlot
} from '.';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

describe('Daily Assignment Slot writes', () => {
	it('sets one slot through the Calendar-owned interface', async () => {
		const ctx = buildContext();

		const result = (await setDailyAssignmentSlot(ctx, {
			date: '2026-03-22',
			assignmentTypeId: 'type-a',
			assigneeId: 'person-1'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({
			date: '2026-03-22',
			assignmentTypeId: 'type-a',
			assigneeId: 'person-1'
		});
	});

	it('clears one slot through the Calendar-owned interface', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'existing-slot',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			}
		]);

		await clearDailyAssignmentSlot(ctx, { date: '2026-03-22', assignmentTypeId: 'type-a' });

		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
	});

	it('replaces a day through the Calendar-owned interface', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'old-slot',
				organization_id: 'test-org',
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'old-person'
			}
		]);

		const result = await replaceDailyAssignmentDay(ctx, {
			date: '2026-03-22',
			records: [{ assignmentTypeId: 'type-a', assigneeId: 'person-1' }]
		});

		expect(result).toHaveLength(1);
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				date: '2026-03-22',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			})
		]);
	});

	it('rejects a multi-record replace day when one manual assignee has a duty conflict', async () => {
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
				id: 'old-slot',
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
			replaceDailyAssignmentDay(ctx, {
				date: '2026-03-22',
				records: [
					{ assignmentTypeId: 'type-a', assigneeId: 'person-1' },
					{ assignmentTypeId: 'type-b', assigneeId: 'person-2' }
				]
			})
		).rejects.toMatchObject({
			status: 409,
			message: 'SGT Nolan is already assigned to duty coverage from 2026-03-22T06:00:00 to 2026-03-22T18:00:00.'
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({ id: 'old-slot', assignee_id: 'old-person' })
		]);
	});

	it('batch replaces slots and maps Daily Assignment Source Lineage to current storage columns', async () => {
		const ctx = buildContext();

		await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [
				{
					date: '2026-03-22',
					assignmentTypeId: 'type-a',
					assigneeId: 'person-1',
					sourceLineage: {
						sourceKind: 'duty-roster-run',
						sourceId: 'run-1',
						sourceRowKey: '2026-03-22'
					}
				}
			]
		});

		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-03-22'
			})
		]);
	});

	it('requires manage assignment policy for clear-only empty batch slots', async () => {
		const ctx = buildContext({ readOnly: true });

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: '' }]
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
	});

	it('prefers generic Daily Assignment Source Lineage over legacy lineage fields', async () => {
		const ctx = buildContext();

		await replaceDailyAssignmentSlotsBatch(ctx, {
			records: [
				{
					date: '2026-03-22',
					assignmentTypeId: 'type-a',
					assigneeId: 'person-1',
					dutyRosterTemplateRunId: 'legacy-run',
					dutyRosterTemplateRunRowDate: 'legacy-row',
					sourceLineage: {
						sourceKind: 'duty-roster-run',
						sourceId: 'generic-run',
						sourceRowKey: 'generic-row'
					}
				}
			]
		});

		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				duty_roster_template_run_id: 'generic-run',
				duty_roster_template_run_row_date: 'generic-row'
			})
		]);
	});

	it('rejects duplicate batch slots before write side effects', async () => {
		const ctx = buildContext();

		await expect(
			replaceDailyAssignmentSlotsBatch(ctx, {
				records: [
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-1' },
					{ date: '2026-03-22', assignmentTypeId: 'type-a', assigneeId: 'person-2' }
				]
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duplicate daily assignment slot in batch: 2026-03-22 / type-a'
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
	});
});
