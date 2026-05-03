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

const PERSON_NCO_ID = '11111111-1111-4111-8111-111111111111';
const PERSON_RUNNER_ID = '22222222-2222-4222-8222-222222222222';
const PERSON_ALT_NCO_ID = '33333333-3333-4333-8333-333333333333';

async function seedTemplate(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: PERSON_NCO_ID,
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
			id: PERSON_RUNNER_ID,
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

async function buildApplyPayload(
	ctx: ReturnType<typeof createTestContext>,
	payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const preview = await handleUseCaseRequest(previewConfig, ctx, payload);
	return {
		...payload,
		snapshotId: preview.snapshotId,
		snapshotFingerprint: preview.snapshotFingerprint
	};
}

async function buildSeriesApplyPayload(
	ctx: ReturnType<typeof createTestContext>,
	payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const preview = await handleUseCaseRequest(previewSeriesConfig, ctx, payload);
	return {
		...payload,
		snapshotId: preview.snapshotId,
		snapshotFingerprint: preview.snapshotFingerprint
	};
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

	it('rejects malformed preview payloads before they reach the use case', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		await expect(
			handleUseCaseRequest(previewConfig, ctx, {
				templateId: template.id
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Event date is required.'
		});
	});

	it('rejects impossible preview dates before they reach the use case', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		await expect(
			handleUseCaseRequest(previewConfig, ctx, {
				templateId: template.id,
				eventDate: '2026-13-45'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Event date must be a real calendar date.'
		});
	});

	it('rejects scoped full editors from previewing advanced duty events', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: true,
				scopeSet: { kind: 'groups', groupIds: ['group-hq'] }
			}
		});

		await expect(
			handleUseCaseRequest(previewConfig, ctx, {
				templateId: '44444444-4444-4444-8444-444444444444',
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

		const result = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

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
		const templateCtx = createTestContext();
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});
		const template = await seedTemplate(templateCtx);
		ctx.store.seed('duty_templates', await templateCtx.rawStore.findMany('duty_templates', templateCtx.auth.orgId));
		ctx.store.seed(
			'duty_template_slots',
			await templateCtx.rawStore.findMany('duty_template_slots', templateCtx.auth.orgId)
		);
		ctx.store.seed(
			'duty_template_rotation_baselines',
			await templateCtx.rawStore.findMany('duty_template_rotation_baselines', templateCtx.auth.orgId)
		);

		const result = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

		expect(result).toMatchObject({
			templateId: template.id
		});
	});

	it('returns the final manual result and preserved original proposal when apply includes slot overrides', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);

		ctx.store.seed('personnel', [
			{
				id: PERSON_ALT_NCO_ID,
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

		const result = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10',
				slotOverrides: [{ templateSlotId: template.slots[0]?.id ?? null, slotIndex: 0, assigneeId: PERSON_ALT_NCO_ID }]
			})
		);

		expect(result.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: PERSON_ALT_NCO_ID,
			assignmentSource: 'manual'
		});
		expect(result.originalProposal).toMatchObject({
			slotInstances: expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0]?.id,
					assigneeId: PERSON_NCO_ID,
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
				assignee_id: PERSON_NCO_ID
			}
		]);

		await expect(
			handleUseCaseRequest(
				applyConfig,
				ctx,
				await buildApplyPayload(ctx, {
					templateId: template.id,
					eventDate: '2026-04-10'
				})
			)
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
		const applied = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

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

	it('blocks direct updates to applied Advanced Duty Run events', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

		ctx.store.seed('personnel', [
			{
				id: PERSON_ALT_NCO_ID,
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

		await expect(
			handleUseCaseRequest(updateExistingConfig, ctx, {
				dutyEventId: applied.id,
				slotOverrides: [{ templateSlotId: template.slots[0]?.id ?? null, slotIndex: 0, assigneeId: PERSON_ALT_NCO_ID }]
			})
		).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining('revision draft workflow')
		});
	});

	it('returns the revision workflow block before collision review for applied Advanced Duty Run events', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const applied = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

		ctx.store.seed('daily_assignments', [
			{
				id: 'assignment-existing',
				organization_id: ctx.auth.orgId,
				date: '2026-04-10',
				assignment_type_id: 'at-existing',
				assignee_id: PERSON_NCO_ID
			}
		]);

		await expect(
			handleUseCaseRequest(updateExistingConfig, ctx, {
				dutyEventId: applied.id
			})
		).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining('revision draft workflow')
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
				id: PERSON_ALT_NCO_ID,
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
							assigneeId: PERSON_ALT_NCO_ID,
							assignmentSource: 'locked'
						}
					]
				}
			]
		});

		expect(result.events[0]?.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: PERSON_ALT_NCO_ID,
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

		const result = await handleUseCaseRequest(
			applySeriesConfig,
			ctx,
			await buildSeriesApplyPayload(ctx, {
				templateId: template.id,
				pattern: 'custom-dates',
				customDates: ['2026-04-04', '2026-04-10']
			})
		);

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
				assignee_id: PERSON_NCO_ID
			}
		]);

		await expect(
			handleUseCaseRequest(
				applySeriesConfig,
				ctx,
				await buildSeriesApplyPayload(ctx, {
					templateId: template.id,
					pattern: 'custom-dates',
					customDates: ['2026-04-10']
				})
			)
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
				id: PERSON_ALT_NCO_ID,
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

		const result = await handleUseCaseRequest(
			applySeriesConfig,
			ctx,
			await buildSeriesApplyPayload(ctx, {
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
								assigneeId: PERSON_ALT_NCO_ID
							}
						]
					}
				]
			})
		);

		expect(result.events[0]?.slotInstances[0]).toMatchObject({
			templateSlotId: template.slots[0]?.id,
			assigneeId: PERSON_ALT_NCO_ID,
			assignmentSource: 'manual'
		});
		expect(result.events[0]?.originalProposal).toMatchObject({
			slotInstances: expect.arrayContaining([
				expect.objectContaining({
					templateSlotId: template.slots[0]?.id,
					assigneeId: PERSON_NCO_ID,
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
		const applied = await handleUseCaseRequest(
			applyConfig,
			ctx,
			await buildApplyPayload(ctx, {
				templateId: template.id,
				eventDate: '2026-04-10'
			})
		);

		const result = await handleUseCaseRequest(deleteEventConfig, ctx, {
			dutyEventId: applied.id
		});

		expect(result).toMatchObject({ deletedEvents: 1 });
		const remaining = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(remaining).toHaveLength(0);
	});

	it('rejects invalid duty event ids before deletion reaches the use case', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(deleteEventConfig, ctx, {
				dutyEventId: 'not-a-uuid'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Duty event ID must be a valid UUID.'
		});
	});
});

describe('DELETE /api/duty-events/runs/[runId]', () => {
	it('deletes a full run and cascades all of its events', async () => {
		const ctx = createTestContext();
		const template = await seedTemplate(ctx);
		const result = await handleUseCaseRequest(
			applySeriesConfig,
			ctx,
			await buildSeriesApplyPayload(ctx, {
				templateId: template.id,
				pattern: 'custom-dates',
				customDates: ['2026-04-04', '2026-04-10']
			})
		);

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
				id: '11111111-1111-4111-8111-111111111111',
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
				id: '22222222-2222-4222-8222-222222222222',
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
			eventIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
		});
		expect(result).toMatchObject({ deletedEvents: 2 });
		const remaining = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
		expect(remaining).toHaveLength(0);
	});
});
