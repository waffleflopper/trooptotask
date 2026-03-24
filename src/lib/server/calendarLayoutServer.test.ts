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
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarData } from '$lib/server/core/useCases/calendarQuery';
import { getActiveOnboardingPersonnelIds } from '$lib/server/core/useCases/onboardingCalendarQuery';
import { formatDate } from '$lib/utils/dates';

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

const RANGE_START = '2026-01-01';
const RANGE_END = '2026-09-30';

describe('calendar layout server (loadWithContext)', () => {
	it('returns calendar data and activeOnboardingPersonnelIds via loadWithContext', async () => {
		const ctx = buildCtx();
		seedCalendarData(ctx.store);

		const result = await loadWithContextCore(ctx, {
			permission: 'calendar',
			fn: async (ctx) => {
				const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
					fetchCalendarData(ctx, { rangeStart: RANGE_START, rangeEnd: RANGE_END }),
					getActiveOnboardingPersonnelIds(ctx)
				]);
				return { ...calendarData, activeOnboardingPersonnelIds };
			}
		});

		expect(result.availabilityEntries).toHaveLength(1);
		expect(result.specialDays).toHaveLength(1);
		expect(result.assignmentTypes).toHaveLength(1);
		expect(result.dailyAssignments).toHaveLength(1);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result.rosterHistory).toHaveLength(1);
		expect(result.activeOnboardingPersonnelIds).toEqual([]);
	});

	it('includes active onboarding personnel IDs when present', async () => {
		const ctx = buildCtx();
		seedCalendarData(ctx.store);
		ctx.store.seed('personnel_onboardings', [
			{ id: 'ob1', organization_id: ORG, personnel_id: 'p1', status: 'in_progress' }
		]);

		const result = await loadWithContextCore(ctx, {
			permission: 'calendar',
			fn: async (ctx) => {
				const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
					fetchCalendarData(ctx, { rangeStart: RANGE_START, rangeEnd: RANGE_END }),
					getActiveOnboardingPersonnelIds(ctx)
				]);
				return { ...calendarData, activeOnboardingPersonnelIds };
			}
		});

		expect(result.activeOnboardingPersonnelIds).toEqual(['p1']);
	});
});
