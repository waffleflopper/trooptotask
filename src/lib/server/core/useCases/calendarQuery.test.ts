import { describe, it, expect, vi } from 'vitest';
import { createInMemoryDataStore, createQueryPortsContext, createTestAuthContext } from '$lib/server/adapters/inMemory';
import type { QueryPorts } from '$lib/server/core/ports';
import {
	fetchCalendarData,
	fetchCalendarBootstrap,
	fetchCalendarRangeData
} from '$lib/server/core/useCases/calendarQuery';

const ORG = 'test-org';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }): QueryPorts & {
	store: ReturnType<typeof createQueryPortsContext>['store'];
} {
	return createQueryPortsContext({ auth: { orgId: ORG, ...overrides?.auth } });
}

const RANGE = { rangeStart: '2026-03-01', rangeEnd: '2026-03-31' };

function seedCalendarData(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('personnel', [
		{
			id: 'p1',
			organization_id: ORG,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '11B',
			clinic_role: 'Medic',
			group_id: 'g1',
			groups: { name: 'Alpha' },
			archived_at: null
		},
		{
			id: 'p2',
			organization_id: ORG,
			rank: 'CPL',
			last_name: 'Jones',
			first_name: 'Jane',
			mos: '68W',
			clinic_role: 'Nurse',
			group_id: 'g2',
			groups: { name: 'Bravo' },
			archived_at: null
		}
	]);
	store.seed('groups', [
		{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	store.seed('status_types', [
		{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 }
	]);
	store.seed('availability_entries', [
		{
			id: 'a1',
			organization_id: ORG,
			personnel_id: 'p1',
			status_type_id: 'st1',
			start_date: '2026-03-01',
			end_date: '2026-03-05',
			note: null
		}
	]);
	store.seed('special_days', [
		{ id: 'sd1', organization_id: ORG, date: '2026-03-15', name: 'Training Holiday', type: 'org-closure' }
	]);
	store.seed('assignment_types', [
		{
			id: 'at1',
			organization_id: ORG,
			name: 'CQ',
			short_name: 'CQ',
			assign_to: 'personnel',
			color: '#ef4444',
			sort_order: 0,
			exempt_personnel_ids: null
		}
	]);
	store.seed('daily_assignments', [
		{ id: 'da1', organization_id: ORG, date: '2026-03-10', assignment_type_id: 'at1', assignee_id: 'p1' }
	]);
	store.seed('user_pinned_groups', [
		{ id: 'pg1', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 0 }
	]);
	store.seed('duty_roster_history', [
		{
			id: 'rh1',
			organization_id: ORG,
			assignment_type_id: 'at1',
			name: 'CQ Roster',
			start_date: '2026-03-01',
			end_date: '2026-03-31',
			roster: [],
			config: {},
			created_at: '2026-03-01T00:00:00Z'
		}
	]);
}

describe('fetchCalendarData', () => {
	it('calls requireView for calendar permission', async () => {
		const ctx = buildCtx();
		const spy = vi.spyOn(ctx.auth, 'requireView');

		await fetchCalendarData(ctx, RANGE);

		expect(spy).toHaveBeenCalledWith('calendar');
	});

	it('returns all 5 data collections with entity transforms (roster history moved to page server)', async () => {
		const ctx = buildCtx();
		seedCalendarData(ctx.store);

		const result = await fetchCalendarData(ctx, RANGE);

		// Availability entries — camelCase transform
		expect(result.availabilityEntries).toHaveLength(1);
		expect(result.availabilityEntries[0]).toMatchObject({
			id: 'a1',
			personnelId: 'p1',
			statusTypeId: 'st1',
			startDate: '2026-03-01',
			endDate: '2026-03-05'
		});

		// Special days
		expect(result.specialDays).toHaveLength(1);
		expect(result.specialDays[0]).toMatchObject({ id: 'sd1', name: 'Training Holiday', date: '2026-03-15' });

		// Assignment types — camelCase transform
		expect(result.assignmentTypes).toHaveLength(1);
		expect(result.assignmentTypes[0]).toMatchObject({
			id: 'at1',
			name: 'CQ',
			shortName: 'CQ',
			assignTo: 'personnel',
			exemptPersonnelIds: []
		});

		// Daily assignments — camelCase transform
		expect(result.dailyAssignments).toHaveLength(1);
		expect(result.dailyAssignments[0]).toMatchObject({
			id: 'da1',
			assignmentTypeId: 'at1',
			assigneeId: 'p1'
		});

		// Pinned groups — custom transform returns just the group_name string
		expect(result.pinnedGroups).toEqual(['Alpha']);

		// Roster history no longer returned from calendarQuery
		expect((result as unknown as Record<string, unknown>).rosterHistory).toBeUndefined();
	});

	it('excludes availability entries outside the date range (overlap logic)', async () => {
		const ctx = buildCtx();
		// Entry entirely before range
		ctx.store.seed('availability_entries', [
			{
				id: 'before',
				organization_id: ORG,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-01-01',
				end_date: '2026-01-15',
				note: null
			}
		]);
		// Entry entirely after range
		ctx.store.seed('availability_entries', [
			{
				id: 'after',
				organization_id: ORG,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-05-01',
				end_date: '2026-05-15',
				note: null
			}
		]);
		// Entry overlapping range start
		ctx.store.seed('availability_entries', [
			{
				id: 'overlap',
				organization_id: ORG,
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-02-20',
				end_date: '2026-03-05',
				note: null
			}
		]);

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.availabilityEntries).toHaveLength(1);
		expect(result.availabilityEntries[0].id).toBe('overlap');
	});

	it('excludes special days and daily assignments outside the date range', async () => {
		const ctx = buildCtx();
		ctx.store.seed('special_days', [
			{ id: 'in', organization_id: ORG, date: '2026-03-15', name: 'In Range', type: 'org-closure' },
			{ id: 'out', organization_id: ORG, date: '2026-05-01', name: 'Out of Range', type: 'org-closure' }
		]);
		ctx.store.seed('daily_assignments', [
			{ id: 'in', organization_id: ORG, date: '2026-03-10', assignment_type_id: 'at1', assignee_id: 'p1' },
			{ id: 'out', organization_id: ORG, date: '2026-01-01', assignment_type_id: 'at1', assignee_id: 'p1' }
		]);

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.specialDays).toHaveLength(1);
		expect(result.specialDays[0].id).toBe('in');
		expect(result.dailyAssignments).toHaveLength(1);
		expect(result.dailyAssignments[0].id).toBe('in');
	});

	it('returns advanced duty events filtered by event_date within the range', async () => {
		const ctx = buildCtx();
		const baseEvent = {
			organization_id: ORG,
			template_id: 'tpl-1',
			template_name: 'Battalion Staff Duty',
			coverage_mode: 'timed',
			is_blocking: true,
			cooldown_hours: 12,
			rules_snapshot: {
				templateId: 'tpl-1',
				templateName: 'Battalion Staff Duty',
				templateStatus: 'active',
				coverageMode: 'timed',
				startTime: '08:00',
				endTime: '20:00',
				scopeType: 'organization',
				scopeGroupIds: [],
				isBlocking: true,
				cooldownHours: 12,
				slots: []
			},
			fill_summary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
			collision_summary: { hasConflicts: false, conflicts: [] },
			original_proposal: null,
			created_at: '2026-02-01T00:00:00Z',
			updated_at: '2026-02-01T00:00:00Z'
		};
		ctx.store.seed('duty_events', [
			{
				id: 'evt-in',
				...baseEvent,
				event_date: '2026-03-10',
				coverage_start: '2026-03-10T08:00:00',
				coverage_end: '2026-03-10T20:00:00'
			},
			{
				id: 'evt-out',
				...baseEvent,
				event_date: '2026-05-01',
				coverage_start: '2026-05-01T08:00:00',
				coverage_end: '2026-05-01T20:00:00'
			}
		]);
		ctx.store.seed('duty_event_slots', [
			{
				id: 'slot-in',
				organization_id: ORG,
				duty_event_id: 'evt-in',
				template_slot_id: 'tslot-1',
				role_label: 'NCO',
				slot_index: 0,
				assignee_id: 'p1',
				assignment_source: 'generated',
				warning_state: 'none',
				fairness_confidence: 'high',
				selection_reason: null,
				unfilled_reason: null,
				sort_order: 0
			}
		]);

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.advancedDutyEvents).toHaveLength(1);
		expect(result.advancedDutyEvents[0].id).toBe('evt-in');
		expect(result.advancedDutyEvents[0].slotInstances).toHaveLength(1);
		expect(result.advancedDutyEvents[0].slotInstances[0].assigneeId).toBe('p1');
	});

	it('returns empty pinned groups when userId is null', async () => {
		const ctx = buildCtx({ auth: { userId: null } });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: 'someone', group_name: 'Alpha', sort_order: 0 }
		]);

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.pinnedGroups).toEqual([]);
	});

	it('filters pinned groups by userId', async () => {
		const ctx = buildCtx({ auth: { userId: 'user-a' } });
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: 'user-a', group_name: 'Alpha', sort_order: 0 },
			{ id: 'pg2', organization_id: ORG, user_id: 'user-b', group_name: 'Bravo', sort_order: 0 }
		]);

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.pinnedGroups).toEqual(['Alpha']);
	});

	// roster history limit test moved to rosterHistoryQuery.test.ts
});

describe('fetchCalendarBootstrap', () => {
	it('returns calendar reference collections for the workspace boundary', async () => {
		const ctx = buildCtx();
		const spy = vi.spyOn(ctx.auth, 'requireView');
		seedCalendarData(ctx.store);

		const result = await fetchCalendarBootstrap(ctx, RANGE);

		expect(spy).toHaveBeenCalledWith('calendar');
		expect(result.personnel.map((person) => person.lastName)).toEqual(['Jones', 'Smith']);
		expect(result.personnel[0].groupName).toBe('Bravo');
		expect(result.groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((statusType) => statusType.name)).toEqual(['Leave']);
		expect(result.pinnedGroups).toEqual(['Alpha']);
	});

	it('returns the configured loss warning window from the organizations row', async () => {
		const ctx = buildCtx();
		seedCalendarData(ctx.store);
		ctx.store.seed('organizations', [{ id: ORG, loss_warning_window_days: 90 }]);

		const result = await fetchCalendarBootstrap(ctx, RANGE);

		expect(result.lossWarningWindowDays).toBe(90);
	});

	it('defaults the loss warning window to 180 when the organizations row is missing the value', async () => {
		const ctx = buildCtx();
		seedCalendarData(ctx.store);

		const result = await fetchCalendarBootstrap(ctx, RANGE);

		expect(result.lossWarningWindowDays).toBe(180);
	});
});

describe('fetchCalendarRangeData', () => {
	it('returns only date-ranged calendar collections for on-demand expansion', async () => {
		const ctx = buildCtx();
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		seedCalendarData(ctx.store);

		const result = await fetchCalendarRangeData(ctx, RANGE);

		expect(result).toEqual({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			availabilityEntries: [
				expect.objectContaining({
					id: 'a1',
					personnelId: 'p1'
				})
			],
			specialDays: [
				expect.objectContaining({
					id: 'sd1',
					name: 'Training Holiday'
				})
			],
			dailyAssignments: [
				expect.objectContaining({
					id: 'da1',
					assignmentTypeId: 'at1'
				})
			],
			advancedDutyEvents: []
		});
		const resultRecord = result as unknown as Record<string, unknown>;
		expect(resultRecord.assignmentTypes).toBeUndefined();
		expect(resultRecord.pinnedGroups).toBeUndefined();
		expect(resultRecord.personnel).toBeUndefined();
		expect(resultRecord.groups).toBeUndefined();
		expect(resultRecord.statusTypes).toBeUndefined();
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[calendar-load]',
			expect.objectContaining({
				orgId: ctx.auth.orgId,
				phase: 'duty-event-hydration',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[calendar-load]',
			expect.objectContaining({
				orgId: ctx.auth.orgId,
				phase: 'date-ranged-query',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});
});
