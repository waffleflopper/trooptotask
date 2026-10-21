import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDashboardScreenModel, type DashboardScreenModel } from './dashboardScreenModel.svelte';
import { rosterStore } from '$features/personnel';
import {
	calendarStatusSource as statusTypesStore,
	calendarAvailabilitySource as availabilityStore,
	calendarAssignmentsSource as dailyAssignmentsStore
} from '$features/calendar';
import { groupsStore } from '$features/personnel';
import type { DashboardWorkspaceResult } from '../contracts';
import type { DashboardPageData } from '../contracts';

const mutableRosterStore = rosterStore as unknown as { items: Array<Record<string, unknown>> };
const mutableStatusTypesStore = statusTypesStore as unknown as { items: Array<Record<string, unknown>> };
const mutableAvailabilityStore = availabilityStore as unknown as {
	items: Array<Record<string, unknown>>;
	loading: boolean;
};
const mutableDailyAssignmentsStore = dailyAssignmentsStore as unknown as { loading: boolean };
const mutableGroupsStore = groupsStore as unknown as { loading: boolean };
const emptyTrainingStats = {
	current: 0,
	expired: 0,
	warningOrange: 0,
	warningYellow: 0,
	notCompleted: 0,
	notRequired: 0,
	total: 0
};

vi.mock('$app/environment', () => ({ browser: false }));

vi.mock('$features/personnel', () => ({
	rosterStore: { items: [] },
	groupsStore: { items: [], loading: false },
	pinnedGroupsStore: { list: [], load: vi.fn() }
}));
vi.mock('$features/calendar', () => ({
	calendarStatusSource: { items: [] },
	calendarAvailabilitySource: { items: [], loading: false },
	calendarAssignmentsSource: { assignments: [], types: [], loading: false }
}));
vi.mock('$features/training', () => ({
	trainingTypesStore: { items: [] }
}));

function makeWorkspaceData(overrides: Record<string, unknown> = {}) {
	return {
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		range: { rangeStart: '2026-04-30', rangeEnd: '2026-05-15' },
		pinnedGroups: [],
		activeOnboardings: [],
		ratingSchemeEntries: [],
		personnel: [],
		groups: [],
		statusTypes: [],
		trainingTypes: [],
		lossWarningWindowDays: 180,
		strengthFloorPercent: 80,
		awardTrackingAcknowledgedPersonnelIds: [],
		...overrides
	};
}

function makeData(
	overrides: Partial<DashboardPageData> = {},
	workspaceOverrides: Record<string, unknown> = {}
): DashboardPageData {
	return {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		viewerDay: { date: '2026-04-23', timeZone: 'UTC' },
		disabledFeatures: [],
		dashboard: {
			workspaceKey: 'dashboard',
			data: makeWorkspaceData(workspaceOverrides),
			hydration: { orgId: 'org-1' } as DashboardWorkspaceResult['hydration']
		},
		trainingSummary: null,
		ictlSummary: null,
		onboardingTrainingCompletions: [],
		onboardingTemplateStepCount: 0,
		ratingSchemeEntryCount: 0,
		orgMemberCount: 0,
		gettingStartedDismissed: false,
		...overrides
	};
}

describe('DashboardScreenModel (migrated context coverage)', () => {
	let ctx: DashboardScreenModel;

	beforeEach(() => {
		vi.restoreAllMocks();
		mutableRosterStore.items = [];
		mutableStatusTypesStore.items = [];
		mutableAvailabilityStore.items = [];
		mutableDailyAssignmentsStore.loading = false;
		mutableGroupsStore.loading = false;
		ctx = createDashboardScreenModel(makeData());
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('today', () => {
		it("is the page load's viewer day even when the browser clock reads another day", () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
			const model = createDashboardScreenModel(
				makeData({ viewerDay: { date: '2026-10-19', timeZone: 'America/Los_Angeles' } })
			);

			expect(model.today).toBe('2026-10-19');
		});
	});

	describe('totalPersonnel / availableCount', () => {
		it('starts at 0 with no store data', () => {
			expect(ctx.totalPersonnel).toBe(0);
			expect(ctx.availableCount).toBe(0);
		});
	});

	describe('dutyStrengthPct', () => {
		it('returns 100 when there are no personnel', () => {
			expect(ctx.dutyStrengthPct).toBe(100);
		});
	});

	describe('statusBreakdown', () => {
		it('returns an empty Map when no availability entries exist', () => {
			expect(ctx.statusBreakdown.size).toBe(0);
		});

		it('reflects streamed store data and ignores availability outside the loaded personnel scope', () => {
			mutableRosterStore.items = [{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }];
			mutableStatusTypesStore.items = [{ id: 'st1', name: 'Leave', color: '#111111', textColor: '#ffffff' }];
			mutableAvailabilityStore.items = [
				{
					id: 'a1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: ctx.today,
					endDate: ctx.today
				},
				{
					id: 'a2',
					personnelId: 'outside-scope',
					statusTypeId: 'st1',
					startDate: ctx.today,
					endDate: ctx.today
				}
			];

			expect(ctx.todayEntries).toHaveLength(1);
			expect(ctx.statusBreakdown.get('st1')?.count).toBe(1);
		});
	});

	describe('isHydrating', () => {
		it('is false once the composite stores are loaded', () => {
			expect(ctx.isHydrating).toBe(false);
		});

		it('is true while any composite store is still loading', () => {
			mutableAvailabilityStore.loading = true;
			expect(createDashboardScreenModel(makeData()).isHydrating).toBe(true);
		});
	});

	describe('trainingStats', () => {
		it('is null when trainingSummary is null', () => {
			expect(ctx.trainingStats).toBeNull();
		});

		it('uses server-provided stats when trainingSummary is present', () => {
			const stats = {
				current: 5,
				expired: 1,
				warningOrange: 2,
				warningYellow: 0,
				notCompleted: 0,
				notRequired: 0,
				total: 8
			};
			const dataWithStats = makeData({
				trainingSummary: { stats, issues: [], expiredPersonnelCount: 1, groupDelinquencies: [] }
			});
			const c = createDashboardScreenModel(dataWithStats);
			expect(c.trainingStats).toEqual(stats);
		});
	});

	describe('upcomingChanges', () => {
		it('returns an empty array when no availability entries', () => {
			expect(ctx.upcomingChanges).toHaveLength(0);
		});

		it('assigns unique keys when repeated changes land on the same day', () => {
			mutableRosterStore.items = [
				{ id: 'p1', rank: 'MAJ', lastName: 'Allumbaugh', firstName: 'Alex' },
				{ id: 'p2', rank: 'MAJ', lastName: 'Allumbaugh', firstName: 'Avery' }
			];
			mutableStatusTypesStore.items = [{ id: 'st1', name: 'Unit', color: '#111111', textColor: '#ffffff' }];
			mutableAvailabilityStore.items = [
				{
					id: 'a1',
					personnelId: 'p1',
					statusTypeId: 'st1',
					startDate: '2099-01-01',
					endDate: '2099-01-03'
				},
				{
					id: 'a2',
					personnelId: 'p2',
					statusTypeId: 'st1',
					startDate: '2099-01-01',
					endDate: '2099-01-03'
				}
			];

			const dashboardModel = createDashboardScreenModel(
				makeData({ viewerDay: { date: '2098-12-31', timeZone: 'UTC' } })
			);
			const keys = dashboardModel.upcomingChanges.map((change) => change.key);

			expect(keys).toEqual([
				'a1-departing-2099-01-01',
				'a2-departing-2099-01-01',
				'a1-returning-2099-01-03',
				'a2-returning-2099-01-03'
			]);
			expect(new Set(keys).size).toBe(keys.length);
		});
	});

	describe('ratingStats', () => {
		afterEach(() => vi.useRealTimers());
		it('returns zero counts with no rating entries', () => {
			expect(ctx.ratingStats.overdue).toBe(0);
			expect(ctx.ratingStats['due-30']).toBe(0);
			expect(ctx.ratingStats['due-60']).toBe(0);
			expect(ctx.ratingStats.current).toBe(0);
		});

		it("buckets only the projected dates and record statuses against the viewer's day", () => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date('2026-11-30T00:00:00'));
			const entries = [
				{ ratingPeriodEnd: '2026-09-25', status: 'active' },
				{ ratingPeriodEnd: '2026-09-28', status: 'active' },
				{ ratingPeriodEnd: '2026-10-20', status: 'active' },
				{ ratingPeriodEnd: '2026-10-10', status: 'change-of-rater' },
				{ ratingPeriodEnd: '2026-10-25', status: 'active' },
				{ ratingPeriodEnd: '2026-10-15', status: 'active' },
				{ ratingPeriodEnd: '2026-11-14', status: 'active' },
				{ ratingPeriodEnd: '2026-12-29', status: 'active' },
				{ ratingPeriodEnd: '2026-07-02', status: 'completed' }
			];
			const model = createDashboardScreenModel(
				makeData({ viewerDay: { date: '2026-09-30', timeZone: 'UTC' } }, { ratingSchemeEntries: entries })
			);
			expect(model.ratingStats).toEqual({ overdue: 2, 'due-30': 4, 'due-60': 1, current: 1 });
		});
	});

	describe('activeOnboardings', () => {
		it('returns empty array when none in data', () => {
			expect(ctx.activeOnboardings).toHaveLength(0);
		});
	});

	describe('groupBreakdown', () => {
		it('returns an empty array when no groups', () => {
			expect(ctx.groupBreakdown).toHaveLength(0);
		});
	});

	describe('gettingStartedDismissed', () => {
		it('reads from data prop', () => {
			const c = createDashboardScreenModel(makeData({ gettingStartedDismissed: true }));
			expect(c.gettingStartedDismissed).toBe(true);
		});

		it('defaults to false', () => {
			expect(ctx.gettingStartedDismissed).toBe(false);
		});
	});

	describe('support data', () => {
		it('starts without support data when checklist metadata is omitted', () => {
			const c = createDashboardScreenModel(
				makeData({
					onboardingTemplateStepCount: undefined,
					ratingSchemeEntryCount: undefined,
					orgMemberCount: undefined,
					gettingStartedDismissed: undefined
				})
			);

			expect(c.hasSupportData).toBe(false);
			expect(c.onboardingTemplateStepCount).toBe(0);
			expect(c.ratingSchemeEntryCount).toBe(0);
			expect(c.orgMemberCount).toBe(0);
			expect(c.gettingStartedDismissed).toBe(false);
		});

		it('applies deferred checklist metadata without rebuilding the model', () => {
			ctx.applySupportData({
				onboardingTemplateStepCount: 4,
				ratingSchemeEntryCount: 3,
				orgMemberCount: 2,
				gettingStartedDismissed: true
			});

			expect(ctx.hasSupportData).toBe(true);
			expect(ctx.onboardingTemplateStepCount).toBe(4);
			expect(ctx.ratingSchemeEntryCount).toBe(3);
			expect(ctx.orgMemberCount).toBe(2);
			expect(ctx.gettingStartedDismissed).toBe(true);
		});
	});

	describe('formatShortDate', () => {
		it('formats a YYYY-MM-DD date as "Mon DD"', () => {
			const result = ctx.formatShortDate('2026-03-15');
			expect(result).toMatch(/Mar 15/);
		});
	});

	describe('upcomingLosses', () => {
		function makePerson(id: string, ets: string | null = null, deros: string | null = null) {
			return {
				id,
				rank: 'SGT',
				lastName: 'Doe',
				firstName: 'Jane',
				mos: '',
				clinicRole: '',
				ets,
				deros,
				groupId: null,
				archivedAt: null
			};
		}

		function daysOut(ctx: DashboardScreenModel, n: number): string {
			const d = new Date(ctx.today + 'T00:00:00');
			d.setDate(d.getDate() + n);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		}

		it('returns an empty array when no personnel have tracked dates', () => {
			mutableRosterStore.items = [makePerson('p1')];
			ctx = createDashboardScreenModel(makeData());
			expect(ctx.upcomingLosses).toEqual([]);
		});

		it('returns a record for personnel whose ETS is within the warning window', () => {
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 60))];
			expect(ctx.upcomingLosses).toHaveLength(1);
			expect(ctx.upcomingLosses[0].triggerType).toBe('ETS');
		});

		it('returns a record for personnel whose DEROS is within the warning window', () => {
			mutableRosterStore.items = [makePerson('p1', null, daysOut(ctx, 45))];
			expect(ctx.upcomingLosses).toHaveLength(1);
			expect(ctx.upcomingLosses[0].triggerType).toBe('PCS / DEROS');
		});

		it('shows no losses when the unit turns Losses and awards off', () => {
			ctx = createDashboardScreenModel(makeData({ disabledFeatures: ['lossesAndAwards'] }));
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 30))];
			expect(ctx.upcomingLosses).toEqual([]);
		});

		it('respects the configured lossWarningWindowDays from the workspace data', () => {
			ctx = createDashboardScreenModel(makeData({}, { lossWarningWindowDays: 30 }));
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 60))];
			expect(ctx.upcomingLosses).toHaveLength(0);
		});

		it('only includes personnel that appear in the scoped rosterStore', () => {
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 30)), makePerson('p2')];
			expect(ctx.upcomingLosses).toHaveLength(1);
			expect(ctx.upcomingLosses[0].personId).toBe('p1');
		});

		it('orders results nearest first', () => {
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 90)), makePerson('p2', daysOut(ctx, 30))];
			const result = ctx.upcomingLosses;
			expect(result[0].personId).toBe('p2');
			expect(result[1].personId).toBe('p1');
		});

		it('marks awardDueSoon true for every entry', () => {
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 45))];
			expect(ctx.upcomingLosses[0].awardDueSoon).toBe(true);
		});

		it('keeps the loss entry but suppresses the award badge when award tracking is acknowledged', () => {
			ctx = createDashboardScreenModel(
				makeData({}, { awardTrackingAcknowledgedPersonnelIds: ['p1'], lossWarningWindowDays: 180 })
			);
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 45))];

			expect(ctx.upcomingLosses).toHaveLength(1);
			expect(ctx.upcomingLosses[0].personId).toBe('p1');
			expect(ctx.upcomingLosses[0].awardDueSoon).toBe(false);
			expect(ctx.upcomingLosses[0].awardTrackingAcknowledged).toBe(true);
		});
	});
});
