import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createDutyTemplate } from './dutyTemplateCrud';
import {
	applyDutyEventFromTemplate,
	applyDutyEventSeriesFromTemplate,
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
			status: 409,
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
		expect(result.events).toHaveLength(2);
		expect(result.events.map((event) => event.eventDate)).toEqual(['2026-04-04', '2026-04-10']);

		const storedEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(storedEvents).toHaveLength(2);
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
