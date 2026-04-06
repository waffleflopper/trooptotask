import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createDutyTemplate } from '$lib/server/core/useCases/dutyTemplateCrud';
import { _postConfig as applyConfig } from './+server';
import { _deleteConfig as deleteEventConfig, _putConfig as updateExistingConfig } from './[eventId]/+server';
import { _postConfig as previewExistingConfig } from './[eventId]/preview/+server';
import { _postConfig as previewConfig } from './preview/+server';
import { _deleteConfig as deleteRunConfig } from './runs/[runId]/+server';
import { _postConfig as deleteLegacyGroupConfig } from './runs/legacy/+server';
import { _postConfig as applySeriesConfig } from './series/+server';
import { _postConfig as previewSeriesConfig } from './series/preview/+server';

async function seedTemplate(ctx: ReturnType<typeof createTestContext>) {
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

	return createDutyTemplate(ctx, {
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
}

describe('POST /api/duty-events/preview', () => {
	it('exports a calendar preview route config', () => {
		expect(previewConfig.permission).toBe('calendar');
		expect(previewConfig.mutation).toBeFalsy();
	});

	it('returns one generated advanced duty event preview', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(previewConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(result).toMatchObject({
			templateId: template.id,
			templateName: 'Battalion Staff Duty',
			coverageStart: '2026-04-10T08:00:00',
			coverageEnd: '2026-04-11T08:00:00'
		});
		expect(result.slotInstances).toHaveLength(2);
	});

	it('rejects scoped full editors from previewing advanced duty events', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: true,
				isFullEditor: true,
				scopedGroupId: 'group-hq'
			}
		});

		await expect(
			handleUseCaseRequest(previewConfig, ctx, {
				templateId: 'template-1',
				eventDate: '2026-04-10'
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
	});
});

describe('POST /api/duty-events', () => {
	it('exports a calendar mutation route config', () => {
		expect(applyConfig.permission).toBe('calendar');
		expect(applyConfig.mutation).toBe(true);
	});

	it('applies one advanced duty event aggregate', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(applyConfig, ctx, {
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
			})
		});
		expect(result.slotInstances).toHaveLength(2);
	});

	it('allows unscoped full editors who are not privileged to apply advanced duty events', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		expect(result).toMatchObject({
			templateId: template.id
		});
	});

	it('returns the final manual result and preserved original proposal when apply includes slot overrides', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('personnel', [
			{
				id: 'person-alt-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zimmer',
				first_name: 'Taylor',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const result = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10',
			slotOverrides: [{ templateSlotId: template.slots[0]?.id ?? null, slotIndex: 0, assigneeId: 'person-alt-nco' }]
		});

		expect(result.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: 'person-alt-nco',
			assignmentSource: 'manual'
		});
		expect(result.originalProposal).toMatchObject({
			slotInstances: expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0]?.id,
					assigneeId: 'person-nco',
					assignmentSource: 'generated'
				})
			])
		});
	});

	it('blocks apply at the route layer until collision review is confirmed', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('daily_assignments', [
			{
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		await expect(
			handleUseCaseRequest(applyConfig, ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before applying this duty event.'
		});
	});
});

describe('POST /api/duty-events/[eventId]/preview', () => {
	it('exports a calendar preview route config', () => {
		expect(previewExistingConfig.permission).toBe('calendar');
		expect(previewExistingConfig.mutation).toBeFalsy();
	});

	it('reopens an applied advanced duty event for editing', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const result = await handleUseCaseRequest(previewExistingConfig, ctx, {
			dutyEventId: applied.id
		});

		expect(result).toMatchObject({
			templateId: template.id,
			eventDate: '2026-04-10',
			collisionSummary: {
				hasConflicts: false,
				conflicts: []
			}
		});
		expect(result.slotInstances).toHaveLength(2);
	});
});

describe('PUT /api/duty-events/[eventId]', () => {
	it('exports a calendar mutation route config', () => {
		expect(updateExistingConfig.permission).toBe('calendar');
		expect(updateExistingConfig.mutation).toBe(true);
	});

	it('updates an applied advanced duty event in place', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		ctx.store.seed('personnel', [
			{
				id: 'person-alt-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zimmer',
				first_name: 'Taylor',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const result = await handleUseCaseRequest(updateExistingConfig, ctx, {
			dutyEventId: applied.id,
			slotOverrides: [{ templateSlotId: template.slots[0]?.id ?? null, slotIndex: 0, assigneeId: 'person-alt-nco' }]
		});

		expect(result).toMatchObject({
			id: applied.id,
			eventDate: '2026-04-10'
		});
		expect(result.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: 'person-alt-nco',
			assignmentSource: 'manual'
		});
	});

	it('blocks update at the route layer until collision review is confirmed', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		ctx.store.seed('daily_assignments', [
			{
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		await expect(
			handleUseCaseRequest(updateExistingConfig, ctx, {
				dutyEventId: applied.id
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before saving this duty event.'
		});
	});
});

describe('POST /api/duty-events/series/preview', () => {
	it('exports a calendar preview route config', () => {
		expect(previewSeriesConfig.permission).toBe('calendar');
		expect(previewSeriesConfig.mutation).toBeFalsy();
	});

	it('returns a recurring series preview for selected weekdays', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(previewSeriesConfig, ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-12',
			pattern: 'selected-weekdays',
			selectedWeekdays: [1, 3, 5]
		});

		expect(result.pattern).toBe('selected-weekdays');
		expect(result.eventDates).toEqual(['2026-04-06', '2026-04-08', '2026-04-10']);
		expect(result.events).toHaveLength(3);
	});

	it('returns a recurring series preview for daily runs', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(previewSeriesConfig, ctx, {
			templateId: template.id,
			startDate: '2026-04-06',
			endDate: '2026-04-08',
			pattern: 'daily'
		});

		expect(result.pattern).toBe('daily');
		expect(result.eventDates).toEqual(['2026-04-06', '2026-04-07', '2026-04-08']);
		expect(result.events).toHaveLength(3);
	});

	it('returns edited series previews when event overrides are provided', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('personnel', [
			{
				id: 'person-alt-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zimmer',
				first_name: 'Taylor',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const result = await handleUseCaseRequest(previewSeriesConfig, ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-10'],
			eventOverrides: [
				{
					eventDate: '2026-04-10',
					slotOverrides: [
						{
							templateSlotId: template.slots[0]?.id ?? null,
							slotIndex: 0,
							assigneeId: 'person-alt-nco',
							assignmentSource: 'locked'
						}
					]
				}
			]
		});

		expect(result.events[0]?.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: 'person-alt-nco',
			assignmentSource: 'locked'
		});
	});
});

describe('POST /api/duty-events/series', () => {
	it('exports a calendar mutation route config', () => {
		expect(applySeriesConfig.permission).toBe('calendar');
		expect(applySeriesConfig.mutation).toBe(true);
	});

	it('applies a recurring series for custom dates', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		const result = await handleUseCaseRequest(applySeriesConfig, ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-04', '2026-04-10']
		});

		expect(result.eventDates).toEqual(['2026-04-04', '2026-04-10']);
		expect(result.events).toHaveLength(2);
		expect(result.run).toMatchObject({
			templateId: template.id,
			pattern: 'custom-dates',
			eventCount: 2
		});
	});

	it('blocks series apply at the route layer until collision review is confirmed', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('daily_assignments', [
			{
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: 'person-nco'
			}
		]);

		await expect(
			handleUseCaseRequest(applySeriesConfig, ctx, {
				templateId: template.id,
				pattern: 'custom-dates',
				customDates: ['2026-04-10']
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Collision review is required before applying this duty series.'
		});
	});

	it('applies series-level slot overrides and preserves the original generated proposal', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('personnel', [
			{
				id: 'person-alt-nco',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Zimmer',
				first_name: 'Taylor',
				mos: '11B',
				clinic_role: 'Squad Leader',
				group_id: 'group-hq',
				group_name: 'Headquarters'
			}
		]);

		const result = await handleUseCaseRequest(applySeriesConfig, ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-10'],
			eventOverrides: [
				{
					eventDate: '2026-04-10',
					slotOverrides: [
						{
							templateSlotId: template.slots[0]?.id ?? null,
							slotIndex: 0,
							assigneeId: 'person-alt-nco'
						}
					]
				}
			]
		});

		expect(result.events[0]?.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: 'person-alt-nco',
			assignmentSource: 'manual'
		});
		expect(result.events[0]?.originalProposal).toMatchObject({
			slotInstances: expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0]?.id,
					assigneeId: 'person-nco',
					assignmentSource: 'generated'
				})
			])
		});
	});
});

describe('DELETE /api/duty-events/[eventId]', () => {
	it('deletes one applied duty event', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(applyConfig, ctx, {
			templateId: template.id,
			eventDate: '2026-04-10'
		});

		const result = await handleUseCaseRequest(deleteEventConfig, ctx, {
			dutyEventId: applied.id
		});

		expect(result).toMatchObject({ deletedEvents: 1 });
		const remaining = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(remaining).toHaveLength(0);
	});
});

describe('DELETE /api/duty-events/runs/[runId]', () => {
	it('deletes a full run and cascades all of its events', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const result = await handleUseCaseRequest(applySeriesConfig, ctx, {
			templateId: template.id,
			pattern: 'custom-dates',
			customDates: ['2026-04-04', '2026-04-10']
		});

		const deleted = await handleUseCaseRequest(deleteRunConfig, ctx, {
			runId: result.run.id
		});

		expect(deleted).toMatchObject({ deletedEvents: 2 });
		const remainingEvents = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		const remainingRuns = await ctx.store.findMany<Record<string, unknown>>('duty_event_runs', ctx.auth.orgId);
		expect(remainingEvents).toHaveLength(0);
		expect(remainingRuns).toHaveLength(0);
	});
});

describe('POST /api/duty-events/runs/legacy', () => {
	it('deletes a list of legacy duty events without run ids', async () => {
		const ctx = createTestContext();
		ctx.store.seed('duty_events', [
			{
				id: 'legacy-1',
				organization_id: ctx.auth.orgId,
				run_id: null,
				template_id: 'template-legacy',
				template_name: 'Legacy CQ',
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
				template_name: 'Legacy CQ',
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

		const result = await handleUseCaseRequest(deleteLegacyGroupConfig, ctx, {
			eventIds: ['legacy-1', 'legacy-2']
		});
		expect(result).toMatchObject({ deletedEvents: 2 });
		const remaining = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(remaining).toHaveLength(0);
	});
});
