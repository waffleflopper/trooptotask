import { describe, it, expect, vi } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard,
	createTestSubscriptionPort,
	createTestNotificationPort,
	createTestBillingPort
} from '$lib/server/adapters/inMemory';
import { fetchCalendarData } from './calendarQuery';

const ORG = 'test-org';

function buildCtx(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }) {
	const store = createInMemoryDataStore();
	return {
		store,
		rawStore: store,
		auth: createTestAuthContext({ orgId: ORG, ...overrides?.auth }),
		audit: createTestAuditPort(),
		readOnlyGuard: createTestReadOnlyGuard(),
		subscription: createTestSubscriptionPort(),
		notifications: createTestNotificationPort(),
		billing: createTestBillingPort()
	};
}

const RANGE = { rangeStart: '2026-03-01', rangeEnd: '2026-03-31' };

function seedCalendarData(store: ReturnType<typeof createInMemoryDataStore>) {
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

	it('returns all 6 data collections with entity transforms', async () => {
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

		// Roster history
		expect(result.rosterHistory).toHaveLength(1);
		expect(result.rosterHistory[0]).toMatchObject({
			id: 'rh1',
			assignmentTypeId: 'at1',
			name: 'CQ Roster'
		});
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

	it('limits roster history to 50 entries', async () => {
		const ctx = buildCtx();
		// Seed 55 roster history entries
		for (let i = 0; i < 55; i++) {
			ctx.store.seed('duty_roster_history', [
				{
					id: `rh-${i}`,
					organization_id: ORG,
					assignment_type_id: 'at1',
					name: `Roster ${i}`,
					start_date: '2026-03-01',
					end_date: '2026-03-31',
					roster: [],
					config: {},
					created_at: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`
				}
			]);
		}

		const result = await fetchCalendarData(ctx, RANGE);

		expect(result.rosterHistory).toHaveLength(50);
	});
});
