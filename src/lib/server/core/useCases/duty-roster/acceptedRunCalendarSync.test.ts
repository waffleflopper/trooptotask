import { describe, expect, it, vi } from 'vitest';
import type { DutyRosterTemplateAcceptedRun } from '$features/duty-roster/templates/dutyRosterTemplates';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	acceptedDutyRosterRunCalendarAssignmentsWereEdited,
	applyAcceptedDutyRosterRunCalendarSync,
	applyReviewedAcceptedDutyRosterRunCalendarSyncPlan,
	buildAcceptedDutyRosterRunCalendarSyncState,
	cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation,
	hydrateAcceptedDutyRosterRunCalendarSyncState,
	loadAcceptedDutyRosterRunCalendarSyncState,
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

function seedRunRow(ctx: ReturnType<typeof buildContext>, run: DutyRosterTemplateAcceptedRun = acceptedRun()) {
	ctx.store.seed('duty_roster_template_runs', [
		{
			id: run.id,
			organization_id: 'test-org',
			template_id: run.templateId,
			template_name: run.templateName,
			status: run.status,
			start_date: run.startDate,
			end_date: run.endDate,
			snapshot_payload: run.snapshotPayload,
			accepted_by_user_id: run.acceptedByUserId,
			accepted_at: run.acceptedAt,
			applied_by_user_id: run.appliedByUserId,
			applied_at: run.appliedAt,
			invalidated_by_user_id: run.invalidatedByUserId,
			invalidated_at: run.invalidatedAt,
			created_at: run.createdAt
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

	it('removes slots by accepted run lineage during invalidation cleanup', async () => {
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
				id: 'other-run-linked-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-3',
				duty_roster_template_run_id: 'run-2',
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

		const result = await removeAcceptedDutyRosterRunLinkedCalendarAssignments(ctx, 'run-1', [
			{
				id: 'linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			}
		]);

		expect(result).toEqual({ cleared: 1, deletedIds: ['linked-1'] });
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({ id: 'other-run-linked-1' }),
			expect.objectContaining({ id: 'manual-1' })
		]);
	});

	it('reports only linked Calendar assignment ids that existed before invalidation cleanup', async () => {
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
			}
		]);

		const result = await removeAcceptedDutyRosterRunLinkedCalendarAssignments(ctx, 'run-1', [
			{
				id: 'linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			},
			{
				id: 'stale-linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-02',
				date: '2026-06-02',
				assignment_type_id: 'type-a',
				assignee_id: 'person-2'
			}
		]);

		expect(result).toEqual({ cleared: 1, deletedIds: ['linked-1'] });
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([]);
	});

	it('keeps applied Calendar state when audit logging fails after first apply', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);
		const originalLog = ctx.audit.log.bind(ctx.audit);
		ctx.audit.log = (event) => {
			if (event.action === 'duty_roster_template_run.applied_to_calendar') {
				throw new Error('audit unavailable');
			}
			originalLog(event);
		};

		const result = await applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun());

		expect(result.acceptedRun.appliedAt).toEqual(expect.any(String));
		expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1',
				duty_roster_template_run_id: 'run-1'
			})
		]);
	});

	it('restores the prior Calendar slot when marking a first apply fails', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);
		ctx.store.seed('daily_assignments', [
			{
				id: 'manual-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-9',
				duty_roster_template_run_id: null,
				duty_roster_template_run_row_date: null
			}
		]);
		const originalUpdate = ctx.store.update.bind(ctx.store);
		const updateSpy = vi.spyOn(ctx.store, 'update').mockImplementation(async (table, orgId, id, data) => {
			if (table === 'duty_roster_template_runs' && id === 'run-1' && 'applied_at' in data) {
				throw new Error('Apply marker failed.');
			}
			return originalUpdate(table, orgId, id, data);
		});

		try {
			await expect(applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun())).rejects.toThrow('Apply marker failed.');

			expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
				expect.objectContaining({
					date: '2026-06-01',
					assignment_type_id: 'type-a',
					assignee_id: 'person-9'
				})
			]);
		} finally {
			updateSpy.mockRestore();
		}
	});

	it('surfaces Calendar rollback failure when marking a first apply fails', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);
		ctx.store.seed('daily_assignments', [
			{
				id: 'manual-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-9',
				duty_roster_template_run_id: null,
				duty_roster_template_run_row_date: null
			}
		]);
		const originalUpdate = ctx.store.update.bind(ctx.store);
		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		const updateSpy = vi.spyOn(ctx.store, 'update').mockImplementation(async (table, orgId, id, data) => {
			if (table === 'duty_roster_template_runs' && id === 'run-1' && 'applied_at' in data) {
				throw new Error('Apply marker failed.');
			}
			return originalUpdate(table, orgId, id, data);
		});
		let dailyAssignmentInsertAttempts = 0;
		const insertManySpy = vi.spyOn(ctx.store, 'insertMany').mockImplementation(async (table, orgId, rows) => {
			if (table === 'daily_assignments') {
				dailyAssignmentInsertAttempts += 1;
				if (dailyAssignmentInsertAttempts === 2) {
					throw new Error('Calendar rollback failed.');
				}
			}
			return originalInsertMany(table, orgId, rows);
		});

		try {
			await expect(applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun())).rejects.toThrow(
				'Failed to roll back Calendar assignments after accepted run applied marker failure. Primary failure: Apply marker failed. Rollback failure: Calendar rollback failed.'
			);
		} finally {
			updateSpy.mockRestore();
			insertManySpy.mockRestore();
		}
	});

	it('restores the prior Calendar slot when first apply slot writes fail after clearing', async () => {
		const ctx = buildContext();
		seedRunRow(ctx);
		ctx.store.seed('daily_assignments', [
			{
				id: 'manual-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-9',
				duty_roster_template_run_id: null,
				duty_roster_template_run_row_date: null
			}
		]);
		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let dailyAssignmentInsertAttempts = 0;
		const insertManySpy = vi.spyOn(ctx.store, 'insertMany').mockImplementation(async (table, orgId, rows) => {
			if (table === 'daily_assignments') {
				dailyAssignmentInsertAttempts += 1;
				if (dailyAssignmentInsertAttempts === 1) {
					throw new Error('Calendar insert failed.');
				}
			}
			return originalInsertMany(table, orgId, rows);
		});

		try {
			await expect(applyAcceptedDutyRosterRunCalendarSync(ctx, acceptedRun())).rejects.toThrow(
				'Calendar insert failed.'
			);

			expect(await ctx.store.findMany('daily_assignments', 'test-org')).toEqual([
				expect.objectContaining({
					date: '2026-06-01',
					assignment_type_id: 'type-a',
					assignee_id: 'person-9'
				})
			]);
		} finally {
			insertManySpy.mockRestore();
		}
	});

	it('restores removed Calendar assignments when invalidation cleanup fails after partial cleanup', async () => {
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
				id: 'linked-2',
				organization_id: 'test-org',
				date: '2026-06-02',
				assignment_type_id: 'type-a',
				assignee_id: 'person-2',
				duty_roster_template_run_id: 'run-2',
				duty_roster_template_run_row_date: '2026-06-02'
			}
		]);
		const originalDeleteManyByIds = ctx.store.deleteManyByIds.bind(ctx.store);
		let cleanupCalls = 0;
		const deleteManyByIdsSpy = vi.spyOn(ctx.store, 'deleteManyByIds').mockImplementation(async (table, orgId, ids) => {
			if (table === 'daily_assignments') {
				cleanupCalls += 1;
				if (cleanupCalls === 2) {
					throw new Error('Calendar cleanup failed.');
				}
			}
			return originalDeleteManyByIds(table, orgId, ids);
		});

		try {
			await expect(
				cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation(ctx, [
					{
						run: acceptedRun({ id: 'run-1', appliedAt: '2026-05-04T12:01:00.000Z' }),
						linkedRows: [
							{
								id: 'linked-1',
								duty_roster_template_run_id: 'run-1',
								duty_roster_template_run_row_date: '2026-06-01',
								date: '2026-06-01',
								assignment_type_id: 'type-a',
								assignee_id: 'person-1'
							}
						]
					},
					{
						run: acceptedRun({
							id: 'run-2',
							startDate: '2026-06-02',
							endDate: '2026-06-02',
							appliedAt: '2026-05-04T12:01:00.000Z',
							snapshotPayload: {
								...acceptedRun().snapshotPayload,
								finalRows: [
									{
										date: '2026-06-02',
										generatedAssigneeId: 'person-2',
										finalAssigneeId: 'person-2',
										assignmentSource: 'generated',
										generatedDisplay: null,
										finalDisplay: null,
										reason: null,
										warnings: []
									}
								]
							}
						}),
						linkedRows: [
							{
								id: 'linked-2',
								duty_roster_template_run_id: 'run-2',
								duty_roster_template_run_row_date: '2026-06-02',
								date: '2026-06-02',
								assignment_type_id: 'type-a',
								assignee_id: 'person-2'
							}
						]
					}
				])
			).rejects.toThrow('Calendar cleanup failed.');

			expect(
				(await ctx.store.findMany<{ id: string }>('daily_assignments', 'test-org')).map((row) => row.id).sort()
			).toEqual(['linked-1', 'linked-2']);
		} finally {
			deleteManyByIdsSpy.mockRestore();
		}
	});

	it('surfaces restore failure when invalidation cleanup rollback cannot restore linked Calendar assignments', async () => {
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
				id: 'linked-2',
				organization_id: 'test-org',
				date: '2026-06-02',
				assignment_type_id: 'type-a',
				assignee_id: 'person-2',
				duty_roster_template_run_id: 'run-2',
				duty_roster_template_run_row_date: '2026-06-02'
			}
		]);
		const originalDeleteManyByIds = ctx.store.deleteManyByIds.bind(ctx.store);
		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let cleanupCalls = 0;
		const deleteManyByIdsSpy = vi.spyOn(ctx.store, 'deleteManyByIds').mockImplementation(async (table, orgId, ids) => {
			if (table === 'daily_assignments') {
				cleanupCalls += 1;
				if (cleanupCalls === 2) {
					throw new Error('Calendar cleanup failed.');
				}
			}
			return originalDeleteManyByIds(table, orgId, ids);
		});
		const insertManySpy = vi.spyOn(ctx.store, 'insertMany').mockImplementation(async (table, orgId, rows) => {
			if (table === 'daily_assignments') {
				throw new Error('Calendar restore failed.');
			}
			return originalInsertMany(table, orgId, rows);
		});

		try {
			await expect(
				cleanupAcceptedDutyRosterRunCalendarAssignmentsForInvalidation(ctx, [
					{
						run: acceptedRun({ id: 'run-1', appliedAt: '2026-05-04T12:01:00.000Z' }),
						linkedRows: [
							{
								id: 'linked-1',
								duty_roster_template_run_id: 'run-1',
								duty_roster_template_run_row_date: '2026-06-01',
								date: '2026-06-01',
								assignment_type_id: 'type-a',
								assignee_id: 'person-1'
							}
						]
					},
					{
						run: acceptedRun({ id: 'run-2', startDate: '2026-06-02', endDate: '2026-06-02' }),
						linkedRows: [
							{
								id: 'linked-2',
								duty_roster_template_run_id: 'run-2',
								duty_roster_template_run_row_date: '2026-06-02',
								date: '2026-06-02',
								assignment_type_id: 'type-a',
								assignee_id: 'person-2'
							}
						]
					}
				])
			).rejects.toThrow(
				'Failed to restore linked Calendar assignments after invalidation cleanup failure. Primary failure: Calendar cleanup failed. Rollback failure: Calendar restore failed.'
			);
		} finally {
			deleteManyByIdsSpy.mockRestore();
			insertManySpy.mockRestore();
		}
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

	it('reports Duty Roster newer than Calendar when a correction has not reached the linked slot', () => {
		const state = buildAcceptedDutyRosterRunCalendarSyncState(
			acceptedRun({
				appliedAt: '2026-05-04T12:01:00.000Z',
				corrections: [
					{
						id: 'correction-1',
						runId: 'run-1',
						runRowDate: '2026-06-01',
						originalAssigneeId: 'person-1',
						originalDisplay: { id: 'person-1', rank: 'SGT', lastName: 'Able', firstName: 'Ann', groupName: 'A' },
						replacementAssigneeId: 'person-2',
						replacementDisplay: {
							id: 'person-2',
							rank: 'SSG',
							lastName: 'Baker',
							firstName: 'Ben',
							groupName: 'A'
						},
						reason: 'Emergency leave swap.',
						correctedByUserId: 'user-1',
						correctedAt: '2026-05-04T12:05:00.000Z',
						countsTowardFuture: true,
						poolOverride: false,
						poolOverrideReasons: []
					}
				]
			}),
			[
				{
					id: 'linked-1',
					duty_roster_template_run_id: 'run-1',
					duty_roster_template_run_row_date: '2026-06-01',
					date: '2026-06-01',
					assignment_type_id: 'type-a',
					assignee_id: 'person-1'
				}
			]
		);

		expect(state).toMatchObject({
			status: 'duty-roster-newer',
			label: 'Duty Roster is newer than Calendar',
			plan: {
				changes: [
					expect.objectContaining({
						date: '2026-06-01',
						sourceRowKey: '2026-06-01',
						action: 'update',
						currentAssigneeId: 'person-1',
						plannedAssigneeId: 'person-2',
						reason: 'Duty Roster Correction: Emergency leave swap.',
						correctionReason: 'Emergency leave swap.'
					})
				]
			}
		});
	});

	it('reports manual Calendar changes as needing review before overwrite', () => {
		const state = buildAcceptedDutyRosterRunCalendarSyncState(acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' }), [
			{
				id: 'linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-3'
			}
		]);

		expect(state.status).toBe('calendar-manually-changed');
		expect(state.summary).toContain('Review before overwriting');
		expect(state.plan.changes).toEqual([
			expect.objectContaining({
				action: 'update',
				currentAssigneeId: 'person-3',
				plannedAssigneeId: 'person-1'
			})
		]);
	});

	it('plans stale duplicate linked assignments for cleanup instead of reporting in sync', () => {
		const state = buildAcceptedDutyRosterRunCalendarSyncState(acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' }), [
			{
				id: 'linked-current',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-1'
			},
			{
				id: 'linked-stale',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-02',
				assignment_type_id: 'type-a',
				assignee_id: 'person-3'
			}
		]);

		expect(state.status).toBe('calendar-manually-changed');
		expect(state.plan.changes).toEqual([
			expect.objectContaining({
				id: 'run-1:2026-06-01:clear',
				date: '2026-06-02',
				sourceRowKey: '2026-06-01',
				action: 'clear',
				currentAssigneeId: 'person-3'
			})
		]);
	});

	it('keeps current assignment type in reviewed plan rollback state', () => {
		const state = buildAcceptedDutyRosterRunCalendarSyncState(acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' }), [
			{
				id: 'linked-moved',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-b',
				assignee_id: 'person-3'
			}
		]);

		expect(state.plan.changes).toEqual([
			expect.objectContaining({
				date: '2026-06-01',
				assignmentTypeId: 'type-a',
				action: 'create',
				currentAssignmentTypeId: null,
				currentAssigneeId: null,
				plannedAssigneeId: 'person-1'
			}),
			expect.objectContaining({
				date: '2026-06-01',
				assignmentTypeId: 'type-b',
				action: 'clear',
				currentAssignmentTypeId: 'type-b',
				currentAssigneeId: 'person-3',
				plannedAssigneeId: null
			})
		]);
	});

	it('shows the live Calendar occupant when manual edits removed Duty Roster lineage', () => {
		const state = buildAcceptedDutyRosterRunCalendarSyncState(
			acceptedRun({
				appliedAt: '2026-05-04T12:01:00.000Z',
				snapshotPayload: {
					...acceptedRun().snapshotPayload,
					selectionPersonnel: [{ id: 'person-3', rank: 'CPT', lastName: 'Hayes', firstName: 'Emma', groupName: 'A' }]
				}
			}),
			[
				{
					id: 'manual-1',
					duty_roster_template_run_id: null,
					duty_roster_template_run_row_date: null,
					date: '2026-06-01',
					assignment_type_id: 'type-a',
					assignee_id: 'person-3'
				}
			]
		);

		expect(state.status).toBe('calendar-manually-changed');
		expect(state.plan.changes).toEqual([
			expect.objectContaining({
				action: 'update',
				currentAssigneeId: 'person-3',
				currentAssigneeLabel: 'CPT Hayes, Emma',
				currentSourceLineage: null,
				plannedAssigneeId: 'person-1'
			})
		]);
	});

	it('loads same-slot Calendar occupants for sync review even when they are no longer linked', async () => {
		const ctx = buildContext();
		const run = acceptedRun({
			appliedAt: '2026-05-04T12:01:00.000Z',
			snapshotPayload: {
				...acceptedRun().snapshotPayload,
				selectionPersonnel: [{ id: 'person-3', rank: 'CPT', lastName: 'Hayes', firstName: 'Emma', groupName: 'A' }]
			}
		});
		seedRunRow(ctx, run);
		ctx.store.seed('daily_assignments', [
			{
				id: 'manual-1',
				organization_id: 'test-org',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-3',
				duty_roster_template_run_id: null,
				duty_roster_template_run_row_date: null
			}
		]);

		const state = await loadAcceptedDutyRosterRunCalendarSyncState(ctx, run);

		expect(state.plan.changes).toEqual([
			expect.objectContaining({
				currentAssigneeId: 'person-3',
				currentAssigneeLabel: 'CPT Hayes, Emma',
				plannedAssigneeId: 'person-1'
			})
		]);
	});

	it('applies a reviewed reapply plan and marks the run applied as one sync module operation', async () => {
		const ctx = buildContext();
		const run = acceptedRun({ appliedAt: '2026-05-04T12:01:00.000Z' });
		seedRunRow(ctx, run);
		const state = buildAcceptedDutyRosterRunCalendarSyncState(run, [
			{
				id: 'linked-1',
				duty_roster_template_run_id: 'run-1',
				duty_roster_template_run_row_date: '2026-06-01',
				date: '2026-06-01',
				assignment_type_id: 'type-a',
				assignee_id: 'person-3'
			}
		]);

		const result = await applyReviewedAcceptedDutyRosterRunCalendarSyncPlan(ctx, run, state.plan);

		expect(result).toMatchObject({
			insertedCount: 1,
			clearedCount: 0,
			acceptedRun: { id: 'run-1', appliedByUserId: 'test-user' }
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
