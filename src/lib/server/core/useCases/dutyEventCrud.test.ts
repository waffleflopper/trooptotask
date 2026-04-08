import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createDutyTemplate } from './dutyTemplateCrud';
import {
	applyDutyEventFromTemplate,
	applyDutyEventSeriesFromTemplate,
	deleteDutyEventById,
	deleteDutyEventRun,
	deleteLegacyDutyEventGroup,
	listDutyEvents,
	listDutyEventsForCalendar,
	listDutyEventsInRange,
	previewDutyEventFromTemplate,
	previewExistingDutyEvent,
	previewDutyEventSeriesFromTemplate,
	updateExistingDutyEvent
} from './dutyEventCrud';

describe('duty event apply use case', () => {
	it('applies one advanced timed duty event as a parent event with slot instances', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-runner',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Baker',
				first_name: 'Jordan',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			description: 'Overnight command coverage',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SPC'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: []
				}
			]
		});

		const result = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(result).toMatchObject({
			templateId: template.id,
			templateName: 'Battalion Staff Duty',
			run: expect.objectContaining({
				templateId: template.id,
				pattern: 'single',
				eventCount: 1
			}),
			eventDate: '2026-04-10',
			coverageMode: 'timed',
			coverageStart: '2026-04-10T08:00:00',
			coverageEnd: '2026-04-11T08:00:00',
			isBlocking: true,
			cooldownHours: 24,
			fillSummary: {
				totalSlots: 2,
				filledSlots: 2,
				unfilledSlots: 0
			}
		});
		expect(result.slotInstances).toHaveLength(2);
		expect(result.slotInstances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					roleLabel: 'NCO',
					slotIndex: 0,
					assigneeId: 'person-nco',
					assignmentSource: 'generated',
					warningState: 'warning',
					fairnessConfidence: 'low',
					unfilledReason: null
				}),
				expect.objectContaining({
					roleLabel: 'Runner',
					slotIndex: 0,
					assigneeId: 'person-runner',
					assignmentSource: 'generated',
					warningState: 'warning',
					fairnessConfidence: 'low',
					unfilledReason: null
				})
			])
		);

		const storedEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		const storedSlots = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId);
		const legacyAssignments = await ctx.store.findMany<Record<string, unknown>>('daily_assignments', ctx.auth.orgId);

		expect(storedEvents).toHaveLength(1);
		expect(storedSlots).toHaveLength(2);
		expect(legacyAssignments).toHaveLength(0);
	});

	it('previews a recurring weekday-only series grouped by duty event date', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-12',
			pattern: 'weekday-only'
		});

		expect(result.templateId).toBe(template.id);
		expect(result.pattern).toBe('weekday-only');
		expect(result.eventDates).toEqual(['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10']);
		expect(result.events).toHaveLength(5);
		expect(result.events[0]).toMatchObject({
			eventDate: '2026-04-06',
			templateName: 'Battalion Staff Duty'
		});
		expect(result.events[4]).toMatchObject({
			eventDate: '2026-04-10',
			coverageStart: '2026-04-10T08:00:00',
			coverageEnd: '2026-04-11T08:00:00'
		});
	});

	it('returns a partial fill preview with a specific slot-level shortfall reason', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SPC'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: []
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.fillSummary).toEqual({
			totalSlots: 2,
			filledSlots: 1,
			unfilledSlots: 1
		});
		expect(preview.slotInstances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					roleLabel: 'NCO',
					assigneeId: 'person-nco',
					unfilledReason: null
				}),
				expect.objectContaining({
					roleLabel: 'Runner',
					assigneeId: null,
					unfilledReason: 'No personnel matched this slot eligibility rules.'
				})
			])
		);
	});

	it('requires explicit collision review before applying over an existing daily assignment', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
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
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: ['SGT Nolan already has a daily assignment on 2026-04-10. Review this collision before apply.']
		});

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before applying this duty event.'
		});

		const result = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			collisionReviewConfirmed: true
		} as never);

		expect(result.slotInstances[0]).toMatchObject({
			assigneeId: 'person-nco'
		});
	});

	it('does not require collision review when a slot forces non-blocking coverage', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
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
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					blockingMode: 'non-blocking'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: false,
			conflicts: []
		});

		const result = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(result.slotInstances[0]).toMatchObject({
			assigneeId: 'person-nco'
		});
	});

	it('treats a persisted blocking slot override as blocking even when the template is non-blocking', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '17:00',
			isBlocking: false,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					blockingMode: 'blocking'
				}
			]
		});

		await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-11'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: ['SGT Nolan is still in cooldown until 2026-04-11T17:00:00. Review this collision before apply.']
		});
	});

	it('requires collision review when an overnight duty overlaps a next-day daily assignment', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
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
				id: 'assignment-next-day',
				organization_id: ctx.auth.orgId,
				date: '2026-04-11',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '18:00',
			endTime: '06:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: ['SGT Nolan already has a daily assignment on 2026-04-11. Review this collision before apply.']
		});

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before applying this duty event.'
		});
	});

	it('surfaces collisions with overlapping existing duty events in preview', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-existing',
				organization_id: ctx.auth.orgId,
				template_id: 'template-existing',
				template_name: 'Existing Staff Duty',
				event_date: '2026-04-10',
				coverage_mode: 'timed',
				coverage_start: '2026-04-10T06:00:00',
				coverage_end: '2026-04-10T18:00:00',
				is_blocking: true,
				cooldown_hours: 12,
				rules_snapshot: {
					slots: [{ templateSlotId: 'existing-slot', rotationPoolKey: 'existing-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-existing',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-existing',
				template_slot_id: 'existing-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-nco',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: [
				'SGT Nolan is already assigned to duty coverage from 2026-04-10T06:00:00 to 2026-04-10T18:00:00. Review this collision before apply.'
			]
		});
	});

	it('surfaces re-applying the same template and date as a replacement collision', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-zulu',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: [
				'An applied advanced duty event already exists for Battalion Staff Duty on 2026-04-10. Applying again will replace its current team assignments. Review this replacement before apply.'
			]
		});
	});

	it('requires confirmation before replacing an applied event for the same template and date', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-zulu',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const firstApply = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before applying this duty event.'
		});

		const replaced = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			collisionReviewConfirmed: true
		});

		expect(replaced.id).toBe(firstApply.id);
		expect(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId)).toHaveLength(1);
	});

	it('keeps a replaced single date in its existing series run', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-zulu',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const appliedSeries = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-10', '2026-04-11']
		});

		const originalRunId = appliedSeries.run.id;
		const eventToReplace = appliedSeries.events.find((event) => event.eventDate === '2026-04-10');

		const replaced = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			collisionReviewConfirmed: true
		});

		expect(replaced.runId).toBe(originalRunId);

		const storedRuns = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId);
		expect(storedRuns).toHaveLength(1);
		expect(storedRuns[0]?.id).toBe(originalRunId);

		const storedEventRow = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			id: eventToReplace?.id ?? replaced.id
		});
		expect(storedEventRow?.run_id).toBe(originalRunId);
	});

	it('ranks candidates by longest break within a rotation pool using manual baselines', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-long-break',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-recent-duty',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-long-break',
					lastServedDate: '2026-03-01'
				},
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-recent-duty',
					lastServedDate: '2026-04-08'
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-10',
			endDate: '2026-04-10',
			pattern: 'daily'
		});

		expect(result.events).toHaveLength(1);
		expect(result.events[0].slotInstances[0]).toMatchObject({
			roleLabel: 'NCO',
			assigneeId: 'person-long-break'
		});
	});

	it('limits advanced series preview generation to the selected run candidates', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-long-break',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-recent-duty',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-long-break',
					lastServedDate: '2026-03-01'
				},
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-recent-duty',
					lastServedDate: '2026-04-08'
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-10',
			endDate: '2026-04-10',
			pattern: 'daily',
			candidatePersonnelIds: ['person-recent-duty']
		});

		expect(result.events).toHaveLength(1);
		expect(result.events[0].slotInstances[0]).toMatchObject({
			roleLabel: 'NCO',
			assigneeId: 'person-recent-duty'
		});
	});

	it('limits advanced series apply generation to the selected run candidates', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-long-break',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-recent-duty',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-long-break',
					lastServedDate: '2026-03-01'
				},
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-recent-duty',
					lastServedDate: '2026-04-08'
				}
			]
		});

		const result = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-10',
			endDate: '2026-04-10',
			pattern: 'daily',
			candidatePersonnelIds: ['person-recent-duty']
		});

		expect(result.events).toHaveLength(1);
		expect(result.events[0].slotInstances[0]).toMatchObject({
			roleLabel: 'NCO',
			assigneeId: 'person-recent-duty'
		});

		const storedSlotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId);
		expect(storedSlotRows).toHaveLength(1);
		expect(storedSlotRows[0]).toMatchObject({
			assignee_id: 'person-recent-duty'
		});
	});

	it('surfaces a low-confidence fairness warning when the rotation pool history is incomplete', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-seeded',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-unseeded',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-seeded',
					lastServedDate: '2026-03-01'
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-10',
			endDate: '2026-04-10',
			pattern: 'daily'
		});

		expect(result.events[0].slotInstances[0]).toMatchObject({
			assigneeId: 'person-unseeded',
			warningState: 'warning',
			fairnessConfidence: 'low'
		});
		expect(result.events[0].slotInstances[0].selectionReason).toContain('Fairness confidence is low');
	});

	it('treats configured calendar statuses as day-scoped exemptions during advanced generation', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-exempt-on-day-one',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-available',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'availability-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-exempt-on-day-one',
				status_type_id: 'status-leave',
				start_date: '2026-04-10',
				end_date: '2026-04-10'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			exemptStatusTypeIds: ['status-leave'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const preview = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'daily',
			startDate: '2026-04-10',
			endDate: '2026-04-11'
		});

		expect(preview.events[0].eventDate).toBe('2026-04-10');
		expect(preview.events[0].slotInstances[0].assigneeId).toBe('person-available');
		expect(preview.events[1].eventDate).toBe('2026-04-11');
		expect(preview.events[1].slotInstances[0].assigneeId).toBe('person-exempt-on-day-one');
	});

	it('treats next-day exempt statuses as unavailable for overnight advanced duty coverage', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-exempt-next-day',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-available-overnight',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'availability-next-day',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-exempt-next-day',
				status_type_id: 'status-leave',
				start_date: '2026-04-11',
				end_date: '2026-04-11'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			exemptStatusTypeIds: ['status-leave'],
			coverageMode: 'timed',
			startTime: '18:00',
			endTime: '06:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-available-overnight'
		});
	});

	it('retries slot persistence with legacy fairness constraints without failing the apply', async () => {
		const ctx = createTestContext();
		let failedLegacyConstraintOnce = false;

		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		ctx.store.insertMany = (async (...args) => {
			const [table, , rows] = args as [string, string, Array<Record<string, unknown>>];
			if (
				!failedLegacyConstraintOnce &&
				table === 'duty_event_slots' &&
				rows.some((row) => row.fairness_confidence === 'medium')
			) {
				failedLegacyConstraintOnce = true;
				throw new Error(
					'new row for relation "duty_event_slots" violates check constraint "duty_event_slots_fairness_confidence_check"'
				);
			}
			return await originalInsertMany(...(args as Parameters<typeof originalInsertMany>));
		}) as typeof ctx.store.insertMany;

		ctx.store.seed('personnel', [
			{
				id: 'person-a',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-b',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Bravo',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-c',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Charlie',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-a',
					lastServedDate: '2026-03-01'
				},
				{
					rotationPoolKey: 'nco-pool',
					personId: 'person-b',
					lastServedDate: '2026-03-05'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances[0].fairnessConfidence).toBe('medium');

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(failedLegacyConstraintOnce).toBe(true);
		expect(applied.slotInstances[0].fairnessConfidence).toBe('low');

		const storedSlots = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId);
		expect(storedSlots).toHaveLength(1);
		expect(storedSlots[0].fairness_confidence).toBe('low');
	});

	it('uses the final manually applied assignee as the fairness-driving history for future previews', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-original',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-manual',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const initialPreview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(initialPreview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-original',
			assignmentSource: 'generated'
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [
				{
					templateSlotId: initialPreview.slotInstances[0].templateSlotId,
					slotIndex: 0,
					assigneeId: 'person-manual'
				}
			]
		} as never);

		expect(applied.slotInstances[0]).toMatchObject({
			assigneeId: 'person-manual',
			assignmentSource: 'manual'
		});

		const nextPreview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-12'
		});

		expect(nextPreview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-original'
		});
	});

	it('ignores future persisted duty events when ranking fairness for a backdated preview', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-future-only',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-past-duty',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '17:00',
			isBlocking: false,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-past-duty',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-01',
				coverage_mode: 'timed',
				coverage_start: '2026-04-01T08:00:00',
				coverage_end: '2026-04-01T17:00:00',
				is_blocking: false,
				cooldown_hours: 0,
				rules_snapshot: {
					slots: [{ templateSlotId: template.slots[0].id, rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			},
			{
				id: 'event-future-duty',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-12',
				coverage_mode: 'timed',
				coverage_start: '2026-04-12T08:00:00',
				coverage_end: '2026-04-12T17:00:00',
				is_blocking: false,
				cooldown_hours: 0,
				rules_snapshot: {
					slots: [{ templateSlotId: template.slots[0].id, rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-12T00:00:00.000Z',
				updated_at: '2026-04-12T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-past-duty',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-past-duty',
				template_slot_id: template.slots[0].id,
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-past-duty',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-future-duty',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-future-duty',
				template_slot_id: template.slots[0].id,
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-future-only',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-future-only'
		});
	});

	it('preserves the original generated proposal when a final applied result is manually edited', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-original',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-manual',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [
				{
					templateSlotId: preview.slotInstances[0].templateSlotId,
					slotIndex: 0,
					assigneeId: 'person-manual'
				}
			]
		} as never);

		expect(applied.slotInstances[0]).toMatchObject({
			assigneeId: 'person-manual',
			assignmentSource: 'manual'
		});
		expect(applied.originalProposal).toMatchObject({
			fillSummary: {
				totalSlots: 1,
				filledSlots: 1,
				unfilledSlots: 0
			},
			slotInstances: [
				expect.objectContaining({
					assigneeId: 'person-original',
					assignmentSource: 'generated'
				})
			]
		});

		const storedEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(storedEvents[0]?.original_proposal).toMatchObject({
			slotInstances: [
				expect.objectContaining({
					assigneeId: 'person-original'
				})
			]
		});
	});

	it('fills remaining preview slots around locked assignments before generation', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-bravo',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Bravo',
				first_name: 'Bailey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 2,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [
				{
					templateSlotId: template.slots[0]?.id ?? null,
					slotIndex: 0,
					assigneeId: 'person-bravo',
					assignmentSource: 'locked'
				}
			]
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-bravo',
			assignmentSource: 'locked'
		});
		expect(preview.slotInstances[1]).toMatchObject({
			assigneeId: 'person-alpha',
			assignmentSource: 'generated'
		});
	});

	it('surfaces a soft warning when a manual override bypasses the generator fairness order', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-original',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-manual',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{ rotationPoolKey: 'nco-pool', personId: 'person-original', lastServedDate: '2026-04-01' },
				{ rotationPoolKey: 'nco-pool', personId: 'person-manual', lastServedDate: '2026-04-09' }
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [
				{
					templateSlotId: template.slots[0]?.id ?? null,
					slotIndex: 0,
					assigneeId: 'person-manual'
				}
			]
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: false,
			conflicts: []
		});
		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-manual',
			assignmentSource: 'manual',
			warningState: 'warning'
		});
		expect(preview.slotInstances[0]?.overrideMessages).toContain(
			'Manual override bypasses the generator fairness order for this slot.'
		);
	});

	it('blocks apply when a manual override assigns someone exempt from the template', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-exempt',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Exempt',
				first_name: 'Evan',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-eligible',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Ready',
				first_name: 'Riley',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			exemptPersonnelIds: ['person-exempt'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const slotOverrides = [
			{
				templateSlotId: template.slots[0]?.id ?? null,
				slotIndex: 0,
				assigneeId: 'person-exempt'
			}
		];

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-exempt',
			warningState: 'conflict'
		});
		expect(preview.slotInstances[0]?.overrideMessages).toContain(
			'SGT Exempt is exempt from this duty template and cannot be manually assigned.'
		);

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10',
				collisionReviewConfirmed: true,
				slotOverrides
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Resolve hard-rule assignment conflicts before applying this duty event.'
		});
	});

	it('blocks apply when a manual override assigns someone with an exempt status', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-status-exempt',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Status',
				first_name: 'Sam',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-eligible',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Ready',
				first_name: 'Riley',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('availability_entries', [
			{
				id: 'availability-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-status-exempt',
				status_type_id: 'status-leave',
				start_date: '2026-04-10',
				end_date: '2026-04-10'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			exemptStatusTypeIds: ['status-leave'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const slotOverrides = [
			{
				templateSlotId: template.slots[0]?.id ?? null,
				slotIndex: 0,
				assigneeId: 'person-status-exempt'
			}
		];

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-status-exempt',
			warningState: 'conflict'
		});
		expect(preview.slotInstances[0]?.overrideMessages).toContain(
			'SGT Status has an exempt status for 2026-04-10 and cannot be manually assigned.'
		);

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10',
				collisionReviewConfirmed: true,
				slotOverrides
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Resolve hard-rule assignment conflicts before applying this duty event.'
		});
	});

	it('blocks apply when the same person is manually assigned to multiple preview slots', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-other',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Bravo',
				first_name: 'Bailey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO 1',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				},
				{
					roleLabel: 'NCO 2',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const slotOverrides = [
			{
				templateSlotId: template.slots[0]?.id ?? null,
				slotIndex: 0,
				assigneeId: 'person-nco'
			},
			{
				templateSlotId: template.slots[1]?.id ?? null,
				slotIndex: 0,
				assigneeId: 'person-nco'
			}
		];

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides
		});

		expect(preview.collisionSummary.conflicts).toContain(
			'SGT Alpha is assigned to multiple slots in the same duty preview.'
		);

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10',
				collisionReviewConfirmed: true,
				slotOverrides
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Resolve hard-rule assignment conflicts before applying this duty event.'
		});
	});

	it('surfaces a hard conflict when a manual override violates an existing duty cooldown window', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-original',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-manual',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			],
			rotationBaselines: [
				{ rotationPoolKey: 'nco-pool', personId: 'person-original', lastServedDate: '2026-04-01' },
				{ rotationPoolKey: 'nco-pool', personId: 'person-manual', lastServedDate: '2026-04-09' }
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-existing',
				organization_id: ctx.auth.orgId,
				template_id: 'template-existing',
				template_name: 'Existing Staff Duty',
				event_date: '2026-04-09',
				coverage_mode: 'timed',
				coverage_start: '2026-04-09T08:00:00',
				coverage_end: '2026-04-09T20:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'existing-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-existing',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-existing',
				template_slot_id: 'existing-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-manual',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [
				{
					templateSlotId: template.slots[0]?.id ?? null,
					slotIndex: 0,
					assigneeId: 'person-manual'
				}
			]
		});

		expect(preview.collisionSummary).toEqual({
			hasConflicts: true,
			conflicts: ['SGT Zulu is still in cooldown until 2026-04-10T20:00:00. Review this collision before apply.']
		});
		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-manual',
			warningState: 'conflict'
		});
		expect(preview.slotInstances[0]?.overrideMessages).toContain(
			'SGT Zulu is still in cooldown until 2026-04-10T20:00:00. Review this collision before apply.'
		);
	});

	it('uses shared rotation-pool history across different slot definitions', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-shared-recent',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-shared-next',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'shared-staff-duty',
					sortOrder: 0
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Driver'],
					rotationPoolKey: 'shared-staff-duty',
					sortOrder: 1
				}
			]
		});

		await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-01'
		});

		await ctx.store.update('personnel', ctx.auth.orgId, 'person-shared-recent', {
			clinic_role: 'Squad Leader'
		});
		await ctx.store.update('personnel', ctx.auth.orgId, 'person-shared-next', {
			clinic_role: 'Squad Leader'
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances.find((slot) => slot.roleLabel === 'NCO')).toMatchObject({
			assigneeId: 'person-shared-next'
		});
	});

	it('keeps fairness history separated when slot definitions use different rotation pools', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-pool-recent',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-pool-next',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool',
					sortOrder: 0
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Driver'],
					rotationPoolKey: 'runner-pool',
					sortOrder: 1
				}
			]
		});

		await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-01'
		});

		await ctx.store.update('personnel', ctx.auth.orgId, 'person-pool-recent', {
			clinic_role: 'Squad Leader'
		});
		await ctx.store.update('personnel', ctx.auth.orgId, 'person-pool-next', {
			clinic_role: 'Squad Leader'
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances.find((slot) => slot.roleLabel === 'NCO')).toMatchObject({
			assigneeId: 'person-pool-recent'
		});
	});

	it('prefers selected groups when longest-break history is otherwise tied', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-not-preferred',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-preferred',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-alpha',
				group_name: 'Alpha'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'organization',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					preferredGroupIds: ['group-alpha'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-preferred'
		});
	});

	it('avoids more recent weekend duty before applying the preferred-group tie-break', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-weekend-preferred',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-alpha',
				group_name: 'Alpha'
			},
			{
				id: 'person-weekend-rested',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'organization',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					preferredGroupIds: ['group-alpha'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-weekend-recent',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-05',
				coverage_mode: 'timed',
				coverage_start: '2026-04-05T08:00:00',
				coverage_end: '2026-04-06T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-05T00:00:00.000Z',
				updated_at: '2026-04-05T00:00:00.000Z'
			},
			{
				id: 'event-weekend-older',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-03-15',
				coverage_mode: 'timed',
				coverage_start: '2026-03-15T08:00:00',
				coverage_end: '2026-03-16T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-03-15T00:00:00.000Z',
				updated_at: '2026-03-15T00:00:00.000Z'
			},
			{
				id: 'event-weekday-a',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-08',
				coverage_mode: 'timed',
				coverage_start: '2026-04-08T08:00:00',
				coverage_end: '2026-04-09T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-08T00:00:00.000Z',
				updated_at: '2026-04-08T00:00:00.000Z'
			},
			{
				id: 'event-weekday-b',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-08',
				coverage_mode: 'timed',
				coverage_start: '2026-04-08T08:00:00',
				coverage_end: '2026-04-09T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-08T00:00:00.000Z',
				updated_at: '2026-04-08T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-weekend-recent',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekend-recent',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-preferred',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-weekend-older',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekend-older',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-rested',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-weekday-a',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekday-a',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-preferred',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-weekday-b',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekday-b',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-rested',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-12'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-weekend-rested'
		});
	});

	it('uses the saved soft-preference order when preferred groups should outrank weekend spacing', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-weekend-preferred',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-alpha',
				group_name: 'Alpha'
			},
			{
				id: 'person-weekend-rested',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'organization',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			softPreferences: [
				{ type: 'preferred-group', enabled: true },
				{ type: 'weekend', enabled: true },
				{ type: 'holiday-closure', enabled: true },
				{ type: 'longest-break', enabled: true }
			],
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					preferredGroupIds: ['group-alpha'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-weekend-recent',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-05',
				coverage_mode: 'timed',
				coverage_start: '2026-04-05T08:00:00',
				coverage_end: '2026-04-06T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-05T00:00:00.000Z',
				updated_at: '2026-04-05T00:00:00.000Z'
			},
			{
				id: 'event-weekend-older',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-03-15',
				coverage_mode: 'timed',
				coverage_start: '2026-03-15T08:00:00',
				coverage_end: '2026-03-16T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-03-15T00:00:00.000Z',
				updated_at: '2026-03-15T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-weekend-recent',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekend-recent',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-preferred',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-weekend-older',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-weekend-older',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-weekend-rested',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-12'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-weekend-preferred'
		});
	});

	it('avoids back-to-back holiday or closure duty before applying later soft preferences', async () => {
		const ctx = createTestContext();

		ctx.store.seed('special_days', [
			{
				id: 'holiday-old',
				organization_id: ctx.auth.orgId,
				date: '2026-03-01',
				name: 'Training Holiday',
				type: 'org-closure'
			},
			{
				id: 'holiday-recent',
				organization_id: ctx.auth.orgId,
				date: '2026-04-01',
				name: 'Training Holiday',
				type: 'org-closure'
			},
			{
				id: 'holiday-current',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				name: 'Training Holiday',
				type: 'org-closure'
			}
		]);

		ctx.store.seed('personnel', [
			{
				id: 'person-holiday-preferred',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-alpha',
				group_name: 'Alpha'
			},
			{
				id: 'person-holiday-rested',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'organization',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					preferredGroupIds: ['group-alpha'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		ctx.store.seed('duty_events', [
			{
				id: 'event-holiday-recent',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-01',
				coverage_mode: 'timed',
				coverage_start: '2026-04-01T08:00:00',
				coverage_end: '2026-04-02T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			},
			{
				id: 'event-holiday-older',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-03-01',
				coverage_mode: 'timed',
				coverage_start: '2026-03-01T08:00:00',
				coverage_end: '2026-03-02T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-03-01T00:00:00.000Z',
				updated_at: '2026-03-01T00:00:00.000Z'
			},
			{
				id: 'event-holiday-weekday-a',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-08',
				coverage_mode: 'timed',
				coverage_start: '2026-04-08T08:00:00',
				coverage_end: '2026-04-09T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-08T00:00:00.000Z',
				updated_at: '2026-04-08T00:00:00.000Z'
			},
			{
				id: 'event-holiday-weekday-b',
				organization_id: ctx.auth.orgId,
				template_id: template.id,
				template_name: template.name,
				event_date: '2026-04-08',
				coverage_mode: 'timed',
				coverage_start: '2026-04-08T08:00:00',
				coverage_end: '2026-04-09T08:00:00',
				is_blocking: true,
				cooldown_hours: 24,
				rules_snapshot: {
					slots: [{ templateSlotId: 'history-slot', rotationPoolKey: 'nco-pool' }]
				},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-08T00:00:00.000Z',
				updated_at: '2026-04-08T00:00:00.000Z'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-holiday-recent',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-holiday-recent',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-holiday-preferred',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-holiday-older',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-holiday-older',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-holiday-rested',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-holiday-weekday-a',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-holiday-weekday-a',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-holiday-preferred',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			},
			{
				id: 'slot-holiday-weekday-b',
				organization_id: ctx.auth.orgId,
				duty_event_id: 'event-holiday-weekday-b',
				template_slot_id: 'history-slot',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'person-holiday-rested',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.slotInstances[0]).toMatchObject({
			assigneeId: 'person-holiday-rested'
		});
	});

	it('previews a recurring daily series across the full date range', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-12',
			pattern: 'daily'
		});

		expect(result.pattern).toBe('daily');
		expect(result.eventDates).toEqual([
			'2026-04-06',
			'2026-04-07',
			'2026-04-08',
			'2026-04-09',
			'2026-04-10',
			'2026-04-11',
			'2026-04-12'
		]);
		expect(result.events).toHaveLength(7);
	});

	it('uses prior dates in the same series preview as fairness history even with no persisted events', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-a',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Adams',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-b',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Baker',
				first_name: 'Blair',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-c',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Carter',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-d',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Davis',
				first_name: 'Drew',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Company CQ',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'CQ',
					quantity: 2,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-07',
			pattern: 'daily'
		});

		expect(result.events).toHaveLength(2);
		const dayOneAssignees = result.events[0].slotInstances
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);
		const dayTwoAssignees = result.events[1].slotInstances
			.map((slot) => slot.assigneeId)
			.filter((id): id is string => !!id);

		expect(dayOneAssignees).toHaveLength(2);
		expect(dayTwoAssignees).toHaveLength(2);
		for (const assigneeId of dayOneAssignees) {
			expect(dayTwoAssignees).not.toContain(assigneeId);
		}
	});

	it('supports holiday and closure only recurring runs', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('special_days', [
			{
				id: 'holiday-1',
				organization_id: ctx.auth.orgId,
				date: '2026-04-09',
				name: 'Training Holiday',
				type: 'federal-holiday'
			},
			{
				id: 'closure-1',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				name: 'Motor Pool Closure',
				type: 'org-closure'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const result = await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-12',
			pattern: 'holiday-closure-only'
		});

		expect(result.eventDates).toEqual(['2026-04-09', '2026-04-10']);
		expect(result.events.map((event) => event.eventDate)).toEqual(['2026-04-09', '2026-04-10']);
	});

	it('reuses shared personnel and holiday fetches across a series preview', async () => {
		const ctx = createTestContext();
		const originalFindMany = ctx.store.findMany.bind(ctx.store);
		let personnelQueries = 0;
		let specialDayQueries = 0;

		ctx.store.findMany = (async (...args) => {
			const [table] = args as Parameters<typeof originalFindMany>;
			if (table === 'personnel') {
				personnelQueries += 1;
			}
			if (table === 'special_days') {
				specialDayQueries += 1;
			}
			return originalFindMany(...args);
		}) as typeof ctx.store.findMany;

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		ctx.store.seed('special_days', [
			{
				id: 'holiday-1',
				organization_id: ctx.auth.orgId,
				date: '2026-04-09',
				name: 'Training Holiday',
				type: 'federal-holiday'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		await previewDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			startDate: '2026-04-10',
			endDate: '2026-04-11',
			pattern: 'daily'
		});

		expect(personnelQueries).toBe(1);
		expect(specialDayQueries).toBe(1);
	});

	it('applies a recurring custom-date series as multiple parent duty events', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const result = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-04', '2026-04-10']
		});

		expect(result.eventDates).toEqual(['2026-04-04', '2026-04-10']);
		expect(result.run).toMatchObject({
			templateId: template.id,
			pattern: 'custom-dates',
			startDate: '2026-04-04',
			endDate: '2026-04-10',
			eventCount: 2
		});
		expect(result.events).toHaveLength(2);
		expect(result.events.map((event) => event.eventDate)).toEqual(['2026-04-04', '2026-04-10']);
		expect([...new Set(result.events.map((event) => event.runId))]).toEqual([result.run.id]);

		const storedEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(storedEvents).toHaveLength(2);
	});

	it('does not leave a run behind when series apply is rejected in read-only mode', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});
		ctx.readOnlyGuard.check = async () => true;

		await expect(
			applyDutyEventSeriesFromTemplate(ctx, {
				templateId: template.id,
				pattern: 'custom-dates',
				customDates: ['2026-04-04', '2026-04-10']
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});

		expect(await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId)).toHaveLength(0);
		expect(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId)).toHaveLength(0);
	});

	it('does not leave an orphan run when single-event apply fails during slot persistence', async () => {
		const ctx = createTestContext();
		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let slotInsertAttempts = 0;
		ctx.store.insertMany = (async (...args) => {
			const [table] = args as [string, string, Array<Record<string, unknown>>];
			if (table === 'duty_event_slots' && slotInsertAttempts++ === 0) {
				throw new Error('Simulated slot persistence failure');
			}

			return originalInsertMany(...args);
		}) as typeof ctx.store.insertMany;

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		).rejects.toThrow('Simulated slot persistence failure');

		expect(await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId)).toHaveLength(0);
	});

	it('restores an existing event when replacement slot persistence fails', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-alpha',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-zulu',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const previousEventRow = JSON.parse(
			JSON.stringify(
				await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, { id: applied.id })
			)
		) as Record<string, unknown>;
		const previousSlotRows = JSON.parse(
			JSON.stringify(
				await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
					duty_event_id: applied.id
				})
			)
		) as Record<string, unknown>[];

		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let slotInsertAttempts = 0;
		ctx.store.insertMany = (async (...args) => {
			const [table] = args as [string, string, Array<Record<string, unknown>>];
			if (table === 'duty_event_slots' && slotInsertAttempts++ === 0) {
				throw new Error('Simulated slot persistence failure');
			}

			return originalInsertMany(...args);
		}) as typeof ctx.store.insertMany;

		await expect(
			applyDutyEventFromTemplate(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10',
				collisionReviewConfirmed: true
			})
		).rejects.toThrow('Simulated slot persistence failure');

		const restoredEventRow = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			id: applied.id
		});
		const restoredSlotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
			duty_event_id: applied.id
		});

		expect(restoredEventRow).toEqual(previousEventRow);
		expect(restoredSlotRows).toEqual(previousSlotRows);
	});

	it('cleans up the run and applied events if a later series event fails to persist', async () => {
		const ctx = createTestContext();
		let slotInsertCalls = 0;
		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		ctx.store.insertMany = (async (...args) => {
			const [table] = args as [string, string, Array<Record<string, unknown>>];
			if (table === 'duty_event_slots') {
				slotInsertCalls += 1;
				if (slotInsertCalls === 2) {
					throw new Error('Simulated slot persistence failure');
				}
			}

			return originalInsertMany(...args);
		}) as typeof ctx.store.insertMany;

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		await expect(
			applyDutyEventSeriesFromTemplate(ctx, {
				templateId: template.id,
				pattern: 'custom-dates',
				customDates: ['2026-04-04', '2026-04-10']
			})
		).rejects.toThrow('Simulated slot persistence failure');

		expect(await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId)).toHaveLength(0);
		expect(await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId)).toHaveLength(0);
		expect(await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId)).toHaveLength(0);
	});

	it('applies an overlapping series without failing and splits run history boundaries', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const firstRun = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'daily',
			startDate: '2026-04-05',
			endDate: '2026-04-11'
		});
		expect(firstRun.events).toHaveLength(7);

		const overlappingRun = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'daily',
			startDate: '2026-04-10',
			endDate: '2026-04-12',
			collisionReviewConfirmed: true
		});

		expect(overlappingRun.events.map((event) => event.eventDate)).toEqual(['2026-04-10', '2026-04-11', '2026-04-12']);
		expect(overlappingRun.run).toMatchObject({
			startDate: '2026-04-10',
			endDate: '2026-04-12',
			eventCount: 3
		});

		const dutyEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			template_id: template.id
		});
		expect(dutyEvents).toHaveLength(8);

		const runRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId);
		const runById = new Map(runRows.map((row) => [String(row.id), row]));
		const previousRunRow = runById.get(firstRun.run.id);
		expect(previousRunRow).toMatchObject({
			start_date: '2026-04-05',
			end_date: '2026-04-09',
			event_count: 5
		});
		expect(runById.get(overlappingRun.run.id)).toMatchObject({
			start_date: '2026-04-10',
			end_date: '2026-04-12',
			event_count: 3
		});
	});
});

describe('existing duty event editing', () => {
	it('reopens an applied duty event from its frozen rules without colliding with itself', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		await ctx.store.update('duty_templates', ctx.auth.orgId, template.id, {
			status: 'archived'
		});
		await ctx.store.update('duty_template_slots', ctx.auth.orgId, template.slots[0].id, {
			allowed_ranks: ['SSG']
		});

		const reopened = await previewExistingDutyEvent(ctx, {
			dutyEventId: applied.id
		});

		expect(reopened).toMatchObject({
			templateId: template.id,
			templateName: 'Battalion Staff Duty',
			eventDate: '2026-04-10',
			fillSummary: {
				totalSlots: 1,
				filledSlots: 1,
				unfilledSlots: 0
			},
			collisionSummary: {
				hasConflicts: false,
				conflicts: []
			}
		});
		expect(reopened.slotInstances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0].id,
					assigneeId: 'person-nco',
					assignmentSource: 'generated'
				})
			])
		);
	});

	it('regenerates an applied duty event from its frozen rules without counting the event itself in fairness history', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-earlier',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-later',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(applied.slotInstances[0]).toMatchObject({
			assigneeId: 'person-earlier'
		});

		await ctx.store.update('duty_event_slots', ctx.auth.orgId, applied.slotInstances[0].id, {
			assignee_id: 'person-later',
			assignment_source: 'manual',
			selection_reason: 'Manually edited after apply.'
		});

		const regenerated = await previewExistingDutyEvent(ctx, {
			dutyEventId: applied.id,
			slotOverrides: []
		});

		expect(regenerated.collisionSummary).toEqual({
			hasConflicts: false,
			conflicts: []
		});
		expect(regenerated.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0].id,
			assigneeId: 'person-earlier',
			assignmentSource: 'generated'
		});
	});

	it('updates an existing duty event in place after regenerating its team preview', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-earlier',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-later',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		await ctx.store.update('duty_event_slots', ctx.auth.orgId, applied.slotInstances[0].id, {
			assignee_id: 'person-later',
			assignment_source: 'manual',
			selection_reason: 'Manually edited after apply.'
		});

		const updated = await updateExistingDutyEvent(ctx, {
			dutyEventId: applied.id,
			slotOverrides: []
		});

		expect(updated).toMatchObject({
			id: applied.id,
			eventDate: '2026-04-10',
			fillSummary: {
				totalSlots: 1,
				filledSlots: 1,
				unfilledSlots: 0
			}
		});
		expect(updated.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0].id,
			assigneeId: 'person-earlier',
			assignmentSource: 'generated'
		});

		const storedSlots = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
			duty_event_id: applied.id
		});
		expect(storedSlots).toHaveLength(1);
		expect(storedSlots[0]).toMatchObject({
			assignee_id: 'person-earlier',
			assignment_source: 'generated'
		});
	});

	it('preserves the original proposal when an applied duty event is re-saved', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-earlier',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-later',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const originalProposal = applied.originalProposal;
		expect(originalProposal).not.toBeNull();

		const originalUpdate = ctx.store.update.bind(ctx.store);
		ctx.store.update = (async (...args) => {
			const [table, orgId, id, data] = args as [string, string, string, Record<string, unknown>];
			if (table === 'duty_events' && id === applied.id && !Object.hasOwn(data, 'original_proposal')) {
				return originalUpdate(table, orgId, id, {
					...data,
					original_proposal: null
				});
			}
			return originalUpdate(...args);
		}) as typeof ctx.store.update;

		const updated = await updateExistingDutyEvent(ctx, {
			dutyEventId: applied.id,
			slotOverrides: []
		});

		expect(updated.originalProposal).toEqual(originalProposal);

		const storedEvent = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			id: applied.id
		});
		expect(storedEvent?.original_proposal).toEqual(originalProposal);
	});

	it('preserves the existing event aggregate when replacement slot persistence fails during update', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-earlier',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-later',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zulu',
				first_name: 'Blake',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const previousEventRow = JSON.parse(
			JSON.stringify(
				await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, { id: applied.id })
			)
		) as Record<string, unknown>;
		const previousSlotRows = JSON.parse(
			JSON.stringify(
				await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
					duty_event_id: applied.id
				})
			)
		) as Record<string, unknown>[];

		const originalInsertMany = ctx.store.insertMany.bind(ctx.store);
		let slotInsertAttempts = 0;
		ctx.store.insertMany = (async (...args) => {
			const [table] = args as [string, string, Array<Record<string, unknown>>];
			if (table === 'duty_event_slots' && slotInsertAttempts++ === 0) {
				throw new Error('Simulated duty event slot persistence failure');
			}

			return originalInsertMany(...args);
		}) as typeof ctx.store.insertMany;

		await expect(
			updateExistingDutyEvent(ctx, {
				dutyEventId: applied.id,
				slotOverrides: [
					{
						templateSlotId: template.slots[0].id,
						slotIndex: 0,
						assigneeId: 'person-later',
						assignmentSource: 'manual'
					}
				]
			})
		).rejects.toThrow('Simulated duty event slot persistence failure');

		const restoredEventRow = await ctx.store.findOne<Record<string, unknown>>('duty_events', ctx.auth.orgId, {
			id: applied.id
		});
		const restoredSlotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, {
			duty_event_id: applied.id
		});

		expect(restoredEventRow).toEqual(previousEventRow);
		expect(restoredSlotRows).toEqual(previousSlotRows);
	});

	it('regenerates one slot while preserving the rest of the applied event team context', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-runner',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Baker',
				first_name: 'Jordan',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-alt-runner',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Zimmer',
				first_name: 'Taylor',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Battalion Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'nco-pool'
				},
				{
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SPC'],
					allowedGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Driver'],
					rotationPoolKey: 'runner-pool'
				}
			]
		});

		const applied = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const runnerSlot = applied.slotInstances.find((slot) => slot.roleLabel === 'Runner');
		expect(runnerSlot).toMatchObject({
			assigneeId: 'person-runner'
		});

		await ctx.store.update('duty_event_slots', ctx.auth.orgId, runnerSlot!.id, {
			assignee_id: 'person-alt-runner',
			assignment_source: 'manual',
			selection_reason: 'Manually edited after apply.'
		});

		const preview = await previewExistingDutyEvent(ctx, {
			dutyEventId: applied.id,
			slotOverrides: [
				{
					templateSlotId: template.slots[0]?.id ?? null,
					slotIndex: 0,
					assigneeId: 'person-nco'
				}
			]
		});

		expect(preview.slotInstances).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0]?.id,
					assigneeId: 'person-nco'
				}),
				expect.objectContaining({
					templateSlotId: template.slots[1]?.id,
					assigneeId: 'person-runner',
					assignmentSource: 'generated'
				})
			])
		);
	});
});

async function copyTemplateTo(from: ReturnType<typeof createTestContext>, to: ReturnType<typeof createTestContext>) {
	to.store.seed('duty_templates', await from.rawStore.findMany('duty_templates', from.auth.orgId));
	to.store.seed('duty_template_slots', await from.rawStore.findMany('duty_template_slots', from.auth.orgId));
	to.store.seed(
		'duty_template_rotation_baselines',
		await from.rawStore.findMany('duty_template_rotation_baselines', from.auth.orgId)
	);
}

describe('advanced duty event access enforcement', () => {
	it('allows calendar viewers to load applied advanced duty events for simple-lane availability checks', async () => {
		const adminCtx = createTestContext();
		adminCtx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: adminCtx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		const template = await createDutyTemplate(adminCtx, {
			status: 'active',
			name: 'Scoped Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});
		await applyDutyEventFromTemplate(adminCtx, { templateId: template.id, eventDate: '2026-04-15' });

		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false,
				requireView() {}
			}
		});
		ctx.store.seed('duty_events', await adminCtx.rawStore.findMany('duty_events', adminCtx.auth.orgId));
		ctx.store.seed('duty_event_slots', await adminCtx.rawStore.findMany('duty_event_slots', adminCtx.auth.orgId));
		ctx.store.seed('duty_event_runs', await adminCtx.rawStore.findMany('duty_event_runs', adminCtx.auth.orgId));

		const listed = await listDutyEventsForCalendar(ctx);

		expect(listed).toHaveLength(1);
		expect(listed[0]?.templateId).toBe(template.id);
	});

	it('allows unscoped full editors to manage advanced duty events without privileged access', async () => {
		const templateCtx = createTestContext();
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		const template = await createDutyTemplate(templateCtx, {
			status: 'active',
			name: 'Scoped Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});
		await copyTemplateTo(templateCtx, ctx);

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-15'
		});
		const applied = await applyDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-15' });
		const listed = await listDutyEvents(ctx);
		const deleted = await deleteDutyEventById(ctx, { dutyEventId: applied.id });

		expect(preview.slotInstances).toHaveLength(1);
		expect(listed).toHaveLength(1);
		expect(deleted).toMatchObject({ deletedEvents: 1 });
	});

	it('denies scoped full editors from advanced duty event management', async () => {
		const scopedCtx = createTestContext({
			auth: {
				isPrivileged: true,
				isFullEditor: true,
				scopedGroupId: 'group-alpha'
			}
		});

		await expect(
			previewDutyEventFromTemplate(scopedCtx, { templateId: 'template-1', eventDate: '2026-04-15' })
		).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(
			applyDutyEventFromTemplate(scopedCtx, { templateId: 'template-1', eventDate: '2026-04-15' })
		).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(listDutyEvents(scopedCtx)).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
		await expect(deleteDutyEventById(scopedCtx, { dutyEventId: 'event-1' })).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
	});
});

describe('hardest-slot-first fill order', () => {
	it('fills the slot with one eligible candidate before the slot with many, preserving display order in the output', async () => {
		const ctx = createTestContext();

		// NCO slot: only person-nco is eligible (rank SGT, role Squad Leader)
		// General slot: all three personnel are eligible (no rank/role restriction)
		// Without hardest-first ordering, the General slot would run first and could
		// consume person-nco, leaving the NCO slot unfilled.
		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-b',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Baker',
				first_name: 'Jordan',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			},
			{
				id: 'person-c',
				organization_id: ctx.auth.orgId,
				rank: 'PFC',
				last_name: 'Chen',
				first_name: 'Alex',
				mos: '11B',
				clinic_role: 'Rifleman',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Staff Duty',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					// General slot — listed first in author order, but has 3 eligible candidates
					roleLabel: 'General',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				},
				{
					// NCO slot — listed second, but has only 1 eligible candidate (person-nco)
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: ['Squad Leader']
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		// Both slots should be filled
		expect(preview.fillSummary).toEqual({ totalSlots: 2, filledSlots: 2, unfilledSlots: 0 });

		// NCO slot must be person-nco (the only eligible person for it)
		const ncoSlot = preview.slotInstances.find((s) => s.roleLabel === 'NCO');
		expect(ncoSlot?.assigneeId).toBe('person-nco');

		// General slot must be someone other than person-nco
		const generalSlot = preview.slotInstances.find((s) => s.roleLabel === 'General');
		expect(generalSlot?.assigneeId).not.toBe('person-nco');
		expect(generalSlot?.assigneeId).not.toBeNull();

		// Output must be in display order (General first, NCO second, matching sortOrder)
		expect(preview.slotInstances[0].roleLabel).toBe('General');
		expect(preview.slotInstances[1].roleLabel).toBe('NCO');
	});

	it('uses sortOrder as a tie-breaker when two slots have the same eligible candidate count', async () => {
		const ctx = createTestContext();

		// Two restricted slots, each with exactly 2 eligible candidates that do NOT overlap.
		// Tie-breaking by sortOrder ensures the first-authored slot gets the lower-index person.
		ctx.store.seed('personnel', [
			{
				id: 'p-sgt-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'One',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'g1',
				group_name: 'Alpha'
			},
			{
				id: 'p-sgt-2',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'Two',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'g1',
				group_name: 'Alpha'
			},
			{
				id: 'p-spc-1',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'One',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'g1',
				group_name: 'Alpha'
			},
			{
				id: 'p-spc-2',
				organization_id: ctx.auth.orgId,
				rank: 'SPC',
				last_name: 'Bravo',
				first_name: 'Two',
				mos: '11B',
				clinic_role: 'Driver',
				group_id: 'g1',
				group_name: 'Alpha'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Dual Slot Test',
			scopeType: 'groups',
			scopeGroupIds: ['g1'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO Slot',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				},
				{
					roleLabel: 'Junior Slot',
					quantity: 1,
					allowedRanks: ['SPC'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(preview.fillSummary).toEqual({ totalSlots: 2, filledSlots: 2, unfilledSlots: 0 });

		// Each slot should only pick from its eligible pool
		const ncoSlot = preview.slotInstances.find((s) => s.roleLabel === 'NCO Slot');
		const juniorSlot = preview.slotInstances.find((s) => s.roleLabel === 'Junior Slot');
		expect(['p-sgt-1', 'p-sgt-2']).toContain(ncoSlot?.assigneeId);
		expect(['p-spc-1', 'p-spc-2']).toContain(juniorSlot?.assigneeId);
	});
});

describe('exempt personnel', () => {
	it('never assigns an exempt person even when they are the top-ranked candidate', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-exempt',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Exempt',
				first_name: 'One',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'g1',
				group_name: 'Alpha'
			},
			{
				id: 'person-eligible',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Eligible',
				first_name: 'Two',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'g1',
				group_name: 'Alpha'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Exempt Test Duty',
			scopeType: 'groups',
			scopeGroupIds: ['g1'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			exemptPersonnelIds: ['person-exempt'],
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-10' });

		expect(preview.fillSummary.filledSlots).toBe(1);
		const slot = preview.slotInstances[0];
		expect(slot.assigneeId).toBe('person-eligible');
		expect(slot.assigneeId).not.toBe('person-exempt');
	});

	it('leaves a slot unfilled when all eligible candidates are exempt', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-only',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Only',
				first_name: 'One',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'g1',
				group_name: 'Alpha'
			}
		]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'All Exempt Test',
			scopeType: 'groups',
			scopeGroupIds: ['g1'],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			isBlocking: true,
			cooldownHours: 0,
			exemptPersonnelIds: ['person-only'],
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		const preview = await previewDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-10' });

		expect(preview.fillSummary.filledSlots).toBe(0);
		expect(preview.slotInstances[0].assigneeId).toBeNull();
		expect(preview.slotInstances[0].unfilledReason).toBe('No personnel matched this slot eligibility rules.');
	});
});

describe('duty event run deletion', () => {
	it('deletes one duty event and removes its run when empty', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Delete Single',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'all-day',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});
		const event = await applyDutyEventFromTemplate(ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});
		expect(event.runId).toBeTruthy();

		const result = await deleteDutyEventById(ctx, { dutyEventId: event.id });
		expect(result).toEqual({ deletedEvents: 1 });

		const runRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId);
		expect(runRows).toHaveLength(0);
	});

	it('deletes a run and cascades all events', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Nolan',
				first_name: 'Casey',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);
		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Delete Series',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			coverageMode: 'all-day',
			isBlocking: true,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: [],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});
		const series = await applyDutyEventSeriesFromTemplate(ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-10', '2026-04-11']
		});

		const result = await deleteDutyEventRun(ctx, { runId: series.run.id });
		expect(result).toEqual({ deletedEvents: 2 });

		const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		const runRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId);
		expect(eventRows).toHaveLength(0);
		expect(runRows).toHaveLength(0);
	});

	it('deletes legacy events grouped without run ids', async () => {
		const ctx = createTestContext();
		ctx.store.seed('duty_events', [
			{
				id: 'legacy-1',
				organization_id: ctx.auth.orgId,
				run_id: null,
				template_id: 'template-legacy',
				template_name: 'Legacy Template',
				event_date: '2026-04-10',
				coverage_mode: 'all-day',
				coverage_start: '2026-04-10T00:00:00',
				coverage_end: '2026-04-10T23:59:59',
				is_blocking: true,
				cooldown_hours: 0,
				rules_snapshot: {},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			},
			{
				id: 'legacy-2',
				organization_id: ctx.auth.orgId,
				run_id: null,
				template_id: 'template-legacy',
				template_name: 'Legacy Template',
				event_date: '2026-04-11',
				coverage_mode: 'all-day',
				coverage_start: '2026-04-11T00:00:00',
				coverage_end: '2026-04-11T23:59:59',
				is_blocking: true,
				cooldown_hours: 0,
				rules_snapshot: {},
				fill_summary: {},
				collision_summary: {},
				created_at: '2026-04-01T00:00:00.000Z',
				updated_at: '2026-04-01T00:00:00.000Z'
			}
		]);

		const result = await deleteLegacyDutyEventGroup(ctx, { eventIds: ['legacy-1', 'legacy-2'] });
		expect(result).toEqual({ deletedEvents: 2 });

		const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(eventRows).toHaveLength(0);
	});
});

describe('listDutyEventsInRange — coverage overlap query', () => {
	const personnelRow = {
		id: 'person-nco',
		organization_id: 'test-org',
		rank: 'SGT',
		last_name: 'Nolan',
		first_name: 'Casey',
		mos: '11B',
		clinic_role: 'Squad Leader',
		group_id: 'group-hq',
		group_name: 'Headquarters'
	};

	it('returns an overnight event when the query range covers only the overnight day', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [personnelRow]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Staff Duty',
			description: '',
			scopeType: 'organization',
			scopeGroupIds: [],
			coverageMode: 'timed',
			startTime: '20:00',
			endTime: '06:00',
			isBlocking: true,
			cooldownHours: 12,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		// Apply on Mon Apr 6 → coverage Apr 6 20:00 – Apr 7 06:00
		await applyDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-06' });

		// Query only for Apr 7 — event_date is Apr 6, but coverage overlaps Apr 7
		const results = await listDutyEventsInRange(ctx, { rangeStart: '2026-04-07', rangeEnd: '2026-04-07' });
		expect(results).toHaveLength(1);
		expect(results[0].eventDate).toBe('2026-04-06');
		expect(results[0].coverageEnd).toBe('2026-04-07T06:00:00');
	});

	it('does not return a same-day event whose coverage ends before the query range starts', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [personnelRow]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Morning Formation',
			description: '',
			scopeType: 'organization',
			scopeGroupIds: [],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '17:00',
			isBlocking: false,
			cooldownHours: 0,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		// Apply on Apr 6 → coverage Apr 6 08:00 – Apr 6 17:00
		await applyDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-06' });

		// Query only for Apr 7 — event ends Apr 6 17:00, no overlap
		const results = await listDutyEventsInRange(ctx, { rangeStart: '2026-04-07', rangeEnd: '2026-04-07' });
		expect(results).toHaveLength(0);
	});

	it('returns a normal event that falls within the query range', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [personnelRow]);

		const template = await createDutyTemplate(ctx, {
			status: 'active',
			name: 'Staff Duty',
			description: '',
			scopeType: 'organization',
			scopeGroupIds: [],
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: [],
					allowedMosValues: [],
					allowedRoleValues: []
				}
			]
		});

		await applyDutyEventFromTemplate(ctx, { templateId: template.id, eventDate: '2026-04-07' });

		const results = await listDutyEventsInRange(ctx, { rangeStart: '2026-04-07', rangeEnd: '2026-04-07' });
		expect(results).toHaveLength(1);
		expect(results[0].eventDate).toBe('2026-04-07');
	});
});
