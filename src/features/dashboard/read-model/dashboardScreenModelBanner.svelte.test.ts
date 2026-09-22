import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDashboardScreenModel, type DashboardScreenModel } from './dashboardScreenModel.svelte';
import { rosterStore } from '$lib/stores/roster.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { groupsStore } from '$lib/stores/groups.svelte';
import type { DashboardWorkspaceResult } from '../server/dashboardWorkspaceBootstrap';
import type { DashboardPageData } from '../dashboard.types';

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

// ---------------------------------------------------------------------------
// Minimal stubs for stores & browser APIs
// ---------------------------------------------------------------------------

vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('$lib/data/changelog', () => ({ changelog: [] }));
vi.mock('$lib/stores/whatsNew.svelte', () => ({ whatsNewStore: { show: vi.fn(), close: vi.fn() } }));

// Stub all stores — each returns a minimal reactive-compatible object
vi.mock('$lib/stores/roster.svelte', () => ({
	rosterStore: { items: [] }
}));
vi.mock('$features/calendar/stores/statusTypes.svelte', () => ({
	statusTypesStore: { items: [] }
}));
vi.mock('$features/calendar/stores/availability.svelte', () => ({
	availabilityStore: { items: [], loading: false, load: vi.fn() }
}));
vi.mock('$features/calendar/stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: { assignments: [], types: [], loading: false, load: vi.fn() }
}));
vi.mock('$features/training/stores/trainingTypes.svelte', () => ({
	trainingTypesStore: { items: [] }
}));
vi.mock('$lib/stores/pinnedGroups.svelte', () => ({
	pinnedGroupsStore: { list: [], load: vi.fn() }
}));
vi.mock('$lib/stores/groups.svelte', () => ({
	groupsStore: { items: [], loading: false }
}));
vi.mock('$features/rating-scheme/utils/ratingScheme', () => ({
	getRatingDueStatus: vi.fn((_end: string, status: string) => {
		if (status === 'completed') return 'completed';
		return 'current';
	})
}));

// ---------------------------------------------------------------------------
// Helpers to build minimal page data shapes
// ---------------------------------------------------------------------------

function makeWorkspaceData(overrides: Record<string, unknown> = {}) {
	return {
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		pinnedGroups: [],
		activeOnboardings: [],
		ratingSchemeEntries: [],
		personnel: [],
		groups: [],
		statusTypes: [],
		trainingTypes: [],
		lossWarningWindowDays: 180,
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
		dutyRosterTemplateCount: 0,
		dutyRosterRunCount: 0,
		dutyRosterHistoryCount: 0,
		gettingStartedDismissed: false,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

	// -------------------------------------------------------------------------
	// today / todayDisplay
	// -------------------------------------------------------------------------
	describe('today', () => {
		it('is a string in YYYY-MM-DD format', () => {
			expect(ctx.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	describe('todayDisplay', () => {
		it('returns a human-readable date string', () => {
			// Should contain a month abbreviation and a year
			expect(ctx.todayDisplay).toMatch(/\d{4}/);
			expect(ctx.todayDisplay).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
		});
	});

	// -------------------------------------------------------------------------
	// Strength derived values
	// -------------------------------------------------------------------------
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

	// -------------------------------------------------------------------------
	// statusBreakdown
	// -------------------------------------------------------------------------
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

	describe('statusTypeCount', () => {
		it('reads from dashboard workspace data', () => {
			const c = createDashboardScreenModel(
				makeData({}, { statusTypes: [{ id: 'st1', name: 'Leave', color: '#000', textColor: '#fff' }] })
			);
			expect(c.statusTypeCount).toBe(1);
		});
	});

	// -------------------------------------------------------------------------
	// dutyAssignments
	// -------------------------------------------------------------------------
	describe('dutyAssignments', () => {
		it('returns an empty array when no assignments exist', () => {
			expect(ctx.dutyAssignments).toHaveLength(0);
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

	// -------------------------------------------------------------------------
	// trainingStats / topTrainingIssues
	// -------------------------------------------------------------------------
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
			const dataWithStats = makeData({ trainingSummary: { stats, issues: [] } });
			const c = createDashboardScreenModel(dataWithStats);
			expect(c.trainingStats).toEqual(stats);
		});
	});

	describe('topTrainingIssues', () => {
		it('returns empty array when no summary', () => {
			expect(ctx.topTrainingIssues).toHaveLength(0);
		});

		it('returns issues from trainingSummary', () => {
			const issues = [{ personName: 'SGT Smith', typeName: 'CPR', status: 'expired', label: 'Expired' }];
			const c = createDashboardScreenModel(makeData({ trainingSummary: { stats: emptyTrainingStats, issues } }));
			expect(c.topTrainingIssues).toHaveLength(1);
			expect(c.topTrainingIssues[0].personName).toBe('SGT Smith');
		});

		it('returns multiple issues ordered as provided', () => {
			const issues = [
				{ personName: 'SGT Smith', typeName: 'CPR', status: 'expired', label: 'Expired' },
				{ personName: 'PFC Jones', typeName: 'BLS', status: 'warning-orange', label: 'Expiring' },
				{ personName: 'SPC Clark', typeName: 'SHARP', status: 'expired', label: 'Expired' }
			];
			const c = createDashboardScreenModel(makeData({ trainingSummary: { stats: emptyTrainingStats, issues } }));
			expect(c.topTrainingIssues).toHaveLength(3);
			expect(c.topTrainingIssues[1].typeName).toBe('BLS');
		});
	});

	// -------------------------------------------------------------------------
	// upcomingChanges / upcomingByDate
	// -------------------------------------------------------------------------
	describe('upcomingChanges', () => {
		it('returns an empty array when no availability entries', () => {
			expect(ctx.upcomingChanges).toHaveLength(0);
		});

		it('assigns unique keys when repeated changes land on the same day', () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2098-12-31T12:00:00Z'));
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

			const dashboardModel = createDashboardScreenModel(makeData());
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

	describe('upcomingByDate', () => {
		it('returns an empty Map when no upcoming changes', () => {
			expect(ctx.upcomingByDate.size).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// ratingStats / ratingTotal
	// -------------------------------------------------------------------------
	describe('ratingStats', () => {
		it('returns zero counts with no rating entries', () => {
			expect(ctx.ratingStats.overdue).toBe(0);
			expect(ctx.ratingStats['due-30']).toBe(0);
			expect(ctx.ratingStats['due-60']).toBe(0);
			expect(ctx.ratingStats.current).toBe(0);
		});

		it('does not count completed entries', () => {
			const entries = [{ ratingPeriodEnd: '2026-01-01', status: 'completed' }];
			const c = createDashboardScreenModel(makeData({}, { ratingSchemeEntries: entries }));
			expect(c.ratingTotal).toBe(0);
		});

		it('counts non-completed entries as current (per mock)', () => {
			const entries = [
				{ ratingPeriodEnd: '2026-06-01', status: 'pending' },
				{ ratingPeriodEnd: '2026-07-01', status: 'pending' }
			];
			const c = createDashboardScreenModel(makeData({}, { ratingSchemeEntries: entries }));
			expect(c.ratingTotal).toBe(2);
			expect(c.ratingStats.current).toBe(2);
		});

		it('excludes completed entries from total but counts non-completed', () => {
			const entries = [
				{ ratingPeriodEnd: '2026-06-01', status: 'pending' },
				{ ratingPeriodEnd: '2026-05-01', status: 'completed' },
				{ ratingPeriodEnd: '2026-08-01', status: 'draft' }
			];
			const c = createDashboardScreenModel(makeData({}, { ratingSchemeEntries: entries }));
			expect(c.ratingTotal).toBe(2);
		});
	});

	describe('ratingTotal', () => {
		it('sums all non-completed entries', () => {
			expect(ctx.ratingTotal).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// activeOnboardings
	// -------------------------------------------------------------------------
	describe('activeOnboardings', () => {
		it('returns empty array when none in data', () => {
			expect(ctx.activeOnboardings).toHaveLength(0);
		});

		it('processes onboardings from data (may filter based on personnel store)', () => {
			const onboardings = [
				{ personnelId: 'p1', steps: [{ completed: true }, { completed: false }], id: 'ob1' },
				{ personnelId: 'p2', steps: [], id: 'ob2' }
			];
			const c = createDashboardScreenModel(makeData({}, { activeOnboardings: onboardings }));
			// Returns an array (may be empty if personnel store has no matching records)
			expect(Array.isArray(c.activeOnboardings)).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// groupBreakdown
	// -------------------------------------------------------------------------
	describe('groupBreakdown', () => {
		it('returns an empty array when no groups', () => {
			expect(ctx.groupBreakdown).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	// gettingStartedDismissed
	// -------------------------------------------------------------------------
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
					dutyRosterTemplateCount: undefined,
					dutyRosterRunCount: undefined,
					dutyRosterHistoryCount: undefined,
					gettingStartedDismissed: undefined
				})
			);

			expect(c.hasSupportData).toBe(false);
			expect(c.onboardingTemplateStepCount).toBe(0);
			expect(c.ratingSchemeEntryCount).toBe(0);
			expect(c.orgMemberCount).toBe(0);
			expect(c.dutyRosterTemplateCount).toBe(0);
			expect(c.dutyRosterRunCount).toBe(0);
			expect(c.dutyRosterHistoryCount).toBe(0);
			expect(c.gettingStartedDismissed).toBe(false);
		});

		it('applies deferred checklist metadata without rebuilding the model', () => {
			ctx.applySupportData({
				onboardingTemplateStepCount: 4,
				ratingSchemeEntryCount: 3,
				orgMemberCount: 2,
				dutyRosterTemplateCount: 1,
				dutyRosterRunCount: 2,
				dutyRosterHistoryCount: 3,
				gettingStartedDismissed: true
			});

			expect(ctx.hasSupportData).toBe(true);
			expect(ctx.onboardingTemplateStepCount).toBe(4);
			expect(ctx.ratingSchemeEntryCount).toBe(3);
			expect(ctx.orgMemberCount).toBe(2);
			expect(ctx.dutyRosterTemplateCount).toBe(1);
			expect(ctx.dutyRosterRunCount).toBe(2);
			expect(ctx.dutyRosterHistoryCount).toBe(3);
			expect(ctx.gettingStartedDismissed).toBe(true);
		});
	});

	// -------------------------------------------------------------------------
	// formatShortDate helper
	// -------------------------------------------------------------------------
	describe('formatShortDate', () => {
		it('formats a YYYY-MM-DD date as "Mon DD"', () => {
			const result = ctx.formatShortDate('2026-03-15');
			expect(result).toMatch(/Mar 15/);
		});
	});

	// -------------------------------------------------------------------------
	// upcomingLosses (derived from rosterStore + lossWarningWindowDays)
	// -------------------------------------------------------------------------
	describe('upcomingLosses', () => {
		/** Builds a personnel item with enough fields to satisfy the Personnel type */
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

		/** Returns a date string N days from ctx.today */
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

		it('respects the configured lossWarningWindowDays from the workspace data', () => {
			// Window = 30 days; person at 60 days should be excluded
			ctx = createDashboardScreenModel(makeData({}, { lossWarningWindowDays: 30 }));
			mutableRosterStore.items = [makePerson('p1', daysOut(ctx, 60))];
			expect(ctx.upcomingLosses).toHaveLength(0);
		});

		it('only includes personnel that appear in the scoped rosterStore', () => {
			// Two personnel in store, one with an in-window ETS
			mutableRosterStore.items = [
				makePerson('p1', daysOut(ctx, 30)),
				makePerson('p2') // no dates
			];
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
