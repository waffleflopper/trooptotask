import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createDutyTemplate } from './dutyTemplateCrud';
import {
	applyDutyEventFromTemplate,
	applyDutyEventSeriesFromTemplate,
	previewDutyEventSeriesFromTemplate
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
					warningState: 'none',
					unfilledReason: null
				}),
				expect.objectContaining({
					roleLabel: 'Runner',
					slotIndex: 0,
					assigneeId: 'person-runner',
					assignmentSource: 'generated',
					warningState: 'none',
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
		expect(result.eventDates).toEqual([
			'2026-04-06',
			'2026-04-07',
			'2026-04-08',
			'2026-04-09',
			'2026-04-10'
		]);
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
