import { describe, expect, it } from 'vitest';
import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	acceptedDutyRosterRunCalendarAssignmentsWereEdited,
	applyAcceptedDutyRosterRunCalendarSync,
	hydrateAcceptedDutyRosterRunCalendarSyncState,
	removeAcceptedDutyRosterRunLinkedCalendarAssignments,
	syncAcceptedDutyRosterCorrectionToCalendar
} from './acceptedRunCalendarSync';

function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function acceptedRun(overrides: Partial<DutyRosterTemplateAcceptedRun> = {}): DutyRosterTemplateAcceptedRun {
	return {
		id: 'run-1',
		templateId: 'type-a',
		templateName: 'CQ NCO',
		status: 'accepted',
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-05-04T12:00:00.000Z',
		acceptedByUserId: 'user-1',
		acceptedByDisplayName: null,
		appliedAt: null,
		appliedByUserId: null,
		invalidatedAt: null,
		invalidatedByUserId: null,
		linkedCalendarAssignmentCount: 0,
		calendarAssignmentsEdited: false,
		corrections: [],
		snapshotPayload: {
			snapshotVersion: 1,
			template: {
				id: 'type-a',
				name: 'CQ NCO',
				shortCode: 'CQ'
			},
			finalRows: [
				{
					date: '2026-06-01',
					generatedAssigneeId: 'person-1',
					finalAssigneeId: 'person-1',
					assignmentSource: 'generated',
					generatedDisplay: null,
					finalDisplay: null,
					reason: null,
					warnings: []
				}
			]
		},
		createdAt: '2026-05-04T12:00:00.000Z',
		...overrides
	};
}

function seedRunRow(ctx: ReturnType<typeof buildContext>) {
	ctx.store.seed('duty_roster_template_runs', [
		{
			id: 'run-1',
			organization_id: 'test-org',
			template_id: 'type-a',
			template_name: 'CQ NCO',
			status: 'accepted',
			start_date: '2026-06-01',
			end_date: '2026-06-01',
			snapshot_payload: acceptedRun().snapshotPayload,
			accepted_by_user_id: 'user-1',
			accepted_at: '2026-05-04T12:00:00.000Z',
			applied_by_user_id: null,
			applied_at: null,
			invalidated_by_user_id: null,
			invalidated_at: null,
			created_at: '2026-05-04T12:00:00.000Z'
		}
	]);
}

describe('Accepted Duty Roster Run Calendar Sync', () => {
	it('applies accepted run rows to Calendar with Daily Assignment Source Lineage', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);

		const result = await applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun());

		expect(result).toMatchObject({
			insertedCount: 1,
			clearedCount: 0,
			acceptedRun: {
				id: 'run-1',
				appliedAt: expect.any(String),
				appliedByUserId: 'test-user'
			}
		});
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01'
			})
		]);
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'duty_roster_template_run.applied_to_calendar',
				resourceId: 'run-1'
			})
		);
	});

	it('suppresses apply audit when the caller logs the combined accept-and-apply event', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);

		await applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun(), { audit: false });

		expect(ctx.audit.events).not.toContainEqual(
			expect.objectContaining({ action: 'duty_roster_template_run.applied_to_calendar' })
		);
	});

	it('syncs a Duty Roster Correction to Calendar with source lineage', async () => {
		const ctx = buildContext();
		ctx.store.seed('assignment_types', [
			{
				id: 'type-a',
				organization_id: 'test-org',
				name: 'CQ NCO',
				short_name: 'CQ',
				assign_to: 'personnel',
				color: '#8a5a22',
				sort_order: 0,
				exempt_personnel_ids: [],
				show_in_date_header: false,
				cooldown_hours: 12
			}
		]);

		await syncAcceptedDutyRosterCorrectionToCalendar(ctx, {
			runRow: {
				id: 'run-1',
				organization_id: 'test-org',
				template_id: 'type-a',
				template_name: 'CQ NCO',
				status: 'accepted',
				start_date: '2026-06-01',
				end_date: '2026-06-01',
				snapshot_payload: acceptedRun().snapshotPayload,
				accepted_by_user_id: 'user-1',
				accepted_at: '2026-05-04T12:00:00.000Z',
				applied_by_user_id: 'user-1',
				applied_at: '2026-05-04T12:01:00.000Z',
				invalidated_by_user_id: null,
				invalidated_at: null,
				created_at: '2026-05-04T12:00:00.000Z'
			},
			runRowDate: '2026-06-01',
			replacementAssigneeId: 'person-2'
		});

		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-2',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01'
			})
		]);
	});

	it('removes slots at linked Calendar assignment coordinates during invalidation cleanup', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'linked-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01'
			},
			{
				id: 'manual-1',
				organization_id: 'test-org',
				date: '2026-06-02',
				assignment_type_id: 'type-a',
				assignee_id: 'person-2',
				duty_roster_template_run_id: null,
				duty_roster_template_run_row_date: null
			}
		]);

		const result = await removeAcceptedDutyRosterRunLinkedCalendarAssignments(ctx, [
			{
				id: 'linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			}
		]);

		expect(result).toEqual({ cleared: 1 });
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({ id: 'manual-1' })
		]);
	});

	it('detects linked Calendar assignments edited away from accepted run lineage', () => {
		expect(
			acceptedDutyRosterRunCalendarAssignmentsWereEdited(acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' }), [
				{
					id: 'linked-1',
					duty_roster_template_run_id: 'run-1',
					duty_roster_template_run_row_date: '2026-06-01',
					date: '2026-06-01',
					assignment_type_id: 'type-a',
					assignee_id: 'different-person'
				}
			])
		).toBe(true);
	});

	it('hydrates linked assignment count and edited state for accepted run history', async () => {
		const ctx = buildContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'linked-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'different-person',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01'
			}
		]);

		const [hydrated] = await hydrateAcceptedDutyRosterRunCalendarSyncState(ctx, [
			acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' })
		]);

		expect(hydrated).toMatchObject({
			linkedCalendarAssignmentCount: 1,
			calendarAssignmentsEdited: true
		});
	});
});
